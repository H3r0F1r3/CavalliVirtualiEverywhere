import express, { Request, Response, RequestHandler } from "express";
import { Document, FindCursor, MongoClient, ObjectId, WithId } from "mongodb";
import { randomInt } from "crypto";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const URI = process.env.URI;
const DBNAME = process.env.DBNAME;
const PORT = process.env.PORT || 3000;

if (!URI) {
  throw new Error("URI not found");
}

app.use(express.json());

const CLIENT = new MongoClient(URI);
const DATABASE = CLIENT.db(DBNAME);
const DBUSERS = DATABASE.collection("users");
const DBHORSES = DATABASE.collection("horses");
const DBBETS = DATABASE.collection("bets");
const DBRACES = DATABASE.collection("races");

app.get("/", (req: Request, res: Response) => {
  res.status(200).send("hello world!");
});

app.post("/register", async (req: Request, res: Response) => {
  let username: string = req.body["username"].toLowerCase();
  let password: string = req.body["password"];

  if (password.length < 3) {
    throw new Error("The password is too short");
  }
  let exists = await DBUSERS.findOne({ username: username });
  if (exists) {
    throw new Error("Username already in use");
  }

  let id = new ObjectId();
  DBUSERS.insertOne({
    _id: id,
    username: username,
    password: password,
    role: "user",
    balance: 100,
  }).then(() => {
    res.redirect("users/" + id.toHexString());
  });
});

app.get("/login", async (req: Request, res: Response) => {});

app.post("/bet", async (req: Request, res: Response) => {
  let user = await DBUSERS.findOne({
    _id: ObjectId.createFromHexString(req.body["user"]),
  });
  if (!user) throw new Error("Invalid user");
  if (user["balance"] < req.body["amount"])
    throw new Error("Insufficient funds");

  let race = await DBRACES.findOne({
    _id: ObjectId.createFromHexString(req.body["race"]),
  });
  if (!race) throw new Error("Invalid race");
  if (race["winner"] != null) throw new Error("The race has already ended");
  if (!race["horses"].includes(req.body["horse"]))
    throw new Error("Horse not in race");

  let bet_id: ObjectId = new ObjectId();
  DBBETS.insertOne({
    _id: bet_id,
    user_id: req.body["user"],
    race_id: req.body["race"],
    horse_id: req.body["horse"],
    amount: req.body["amount"],
  }).then(() => {
    DBUSERS.updateOne(
      { _id: ObjectId.createFromHexString(req.body["user"]) },
      { $inc: { balance: -req.body["amount"] } },
    );
    res.redirect("/bets/" + bet_id);
  });
});

app.get("/favicon.ico", (req: Request, res: Response) => {
  res.status(200).send("");
});

app.get("/:collection", async (req: Request, res: Response) => {
  let collection = req.params["collection"];

  let data: Document[] = [];
  if (!["horses", "users", "bets", "races"].includes(collection)) {
    throw new Error("invalid collection");
  }
  let cursor: FindCursor<WithId<Document>>;
  if (collection == "users") {
    cursor = DATABASE.collection(collection)
      .find({ username: { $ne: "admin" } })
      .project({ password: 0 });
  } else {
    cursor = DATABASE.collection(collection).find();
  }

  for await (let item of cursor) {
    data.push(item);
  }

  res.status(200).send(data);
});

app.get(
  "/:collection/:id",
  async (req: Request, res: Response, next: RequestHandler) => {
    let collection = req.params["collection"];
    if (!["horses", "users", "bets", "races"].includes(collection)) {
      throw new Error("Invalid collection");
    }
    let id = req.params["id"];

    if (ObjectId.isValid(id)) {
      res
        .status(200)
        .send(
          await DATABASE.collection(collection).findOne(
            { _id: new ObjectId(id) },
            { projection: { password: 0 } },
          ),
        );
    } else {
      throw new Error("Invalid ID");
    }
  },
);

async function distributeWinnings(race_id: ObjectId) {
  let race_id_string = race_id.toHexString();

  let winning_horse = await DBRACES.findOne({ _id: race_id });
  if (!winning_horse) throw new Error("Race not found");
  winning_horse = winning_horse["winner"];

  let total_data: number = 0,
    winning_data: number = 0;

  let total_data_cursor = DBBETS.aggregate([
    { $match: { race_id: race_id_string } },
    { $group: { _id: null, pot: { $sum: "$amount" } } },
  ]);

  let winning_data_cursor = DBBETS.aggregate([
    { $match: { race_id: race_id_string, horse_id: winning_horse } },
    { $group: { _id: null, pot: { $sum: "$amount" } } },
  ]);

  for await (let data of total_data_cursor) {
    total_data = data["pot"];
  }

  for await (let data of winning_data_cursor) {
    winning_data = data["pot"];
  }

  let multiplier = total_data / winning_data;
  console.log("Multiplier: " + multiplier);

  let winning_users_cursor = DBBETS.aggregate([
    {
      $match: { race_id: race_id_string, horse_id: winning_horse },
    },
    {
      $group: {
        _id: { user_id: "$user_id" },
        amount: { $sum: "$amount" },
      },
    },
  ]);
  for await (let data of winning_users_cursor) {
    console.log(
      "User " + data["_id"]["user_id"] + " won " + data["amount"] * multiplier,
    );
    DBUSERS.updateOne(
      { _id: ObjectId.createFromHexString(data["_id"]["user_id"]) },
      { $inc: { balance: data["amount"] * multiplier } },
    );
  }
}

async function startRace() {
  let horses: String[] = [];
  let date: Date = new Date(Date.now());
  let id: ObjectId = new ObjectId();

  let cursor = DBHORSES.aggregate([
    { $sample: { size: 5 } },
    { $project: { _id: 1 } },
  ]);
  for await (let horse_id of cursor) {
    horses.push(horse_id["_id"].toString());
  }

  console.log(
    "Start",
    "Race: " + id.toHexString(),
    "Date: " + date.toDateString(),
    "Horses: " + horses,
  );

  DBRACES.insertOne(
    {
      _id: id,
      horses: horses,
      date: date.toISOString(),
      winner: undefined,
    },
    {
      ignoreUndefined: false,
    },
  );

  setTimeout(() => {
    let winner = horses[randomInt(horses.length)];
    console.log("End", "Race: " + id.toHexString(), "Winner: " + winner);
    DBRACES.updateOne({ _id: id }, { $set: { winner: winner } });
    distributeWinnings(id);
  }, 30000);
}

app
  .listen(PORT, () => {
    console.log(`Cavalli Virtuali listening on port ${PORT}`);
    //setInterval(async () => startRace(), 30000);
  })
  .on("error", (e) => {
    console.log(e.message);
  });
