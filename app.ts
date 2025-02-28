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

const client = new MongoClient(URI);
const database = client.db(DBNAME);

app.get("/", (req: Request, res: Response) => {
  res.status(200).send("hello world!");
});

app.post("/bet", async (req: Request, res: Response) => {
  let user = await database
    .collection("users")
    .findOne({ _id: new ObjectId(req.body["user"]) });
  let race = await database
    .collection("races")
    .findOne({ _id: new ObjectId(req.body["race"]) });

  if (!user) throw new Error("Invalid user");
  if (user["balance"] < req.body["amount"])
    throw new Error("Insufficient funds");
  if (!race) throw new Error("Invalid race");
  if (race["winner"] != null) throw new Error("The race has already ended");
  console.log(race["horses"]);
  if (!race["horses"].includes(req.body["horse"]))
    throw new Error("Horse not in race");

  let bet_id: ObjectId = new ObjectId();
  database
    .collection("bets")
    .insertOne({
      _id: bet_id,
      user_id: req.body["user"],
      race_id: req.body["race"],
      horse_id: req.body["horse"],
      amount: req.body["amount"],
    })
    .then(() => {
      database
        .collection("users")
        .updateOne(
          { _id: new ObjectId(req.body["user"]) },
          { $set: { balance: user["balance"] - req.body["amount"] } },
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
    cursor = database
      .collection(collection)
      .find({ username: { $ne: "admin" } });
  } else {
    cursor = database.collection(collection).find();
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
          await database
            .collection(collection)
            .findOne({ _id: new ObjectId(id) }),
        );
    } else {
      throw new Error("Invalid ID");
    }
  },
);

async function distributeWinnings(raceId: ObjectId) {}

async function startRace() {
  console.log("Race start");
  let horses: String[] = [];
  let date: Date = new Date(Date.now());
  let id: ObjectId = new ObjectId();
  let cursor = database
    .collection("horses")
    .aggregate([{ $sample: { size: 5 } }, { $project: { _id: 1 } }]);
  for await (let horse_id of cursor) {
    horses.push(horse_id["_id"].toString());
  }
  database.collection("races").insertOne(
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
    console.log("end race");
    let winner = horses[randomInt(horses.length)];
    database
      .collection("races")
      .updateOne({ _id: id }, { $set: { winner: winner } });
    distributeWinnings(id);
  }, 30000);
}

app
  .listen(PORT, () => {
    console.log(`app listening on port ${PORT}`);
    setInterval(async () => startRace(), 30000);
  })
  .on("error", (e) => {
    throw new Error(e.message);
  });
