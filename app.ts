import express, { Request, Response, RequestHandler } from "express";
import dotenv from "dotenv";
import { Document, MongoClient, ObjectId } from "mongodb";
import { randomInt } from "crypto";

dotenv.config();
const app = express();
const URI = process.env.URI;
const DBNAME = process.env.DBNAME;
const PORT = process.env.PORT || 3000;

if (!URI) {
  throw new Error("URI not found");
}

const client = new MongoClient(URI);
const database = client.db(DBNAME);

app.get("/", (req: Request, res: Response) => {
  res.status(200).send("hello world!");
});

app.get("/horses", async (req: Request, res: Response) => {
  let horses: Document[] = [];
  let cursor = database.collection("horses").find();
  for await (let horse of cursor) {
    horses.push(horse);
  }
  res.status(200).send(horses);
});

app.get(
  "/horses/:id",
  async (req: Request, res: Response, next: RequestHandler) => {
    let id = req.params["id"];
    if (ObjectId.isValid(id)) {
      res
        .status(200)
        .send(
          await database
            .collection("horses")
            .findOne({ _id: new ObjectId(id) }),
        );
    } else {
      throw new Error("Invalid horse");
    }
  },
);

app.get("/users", async (req: Request, res: Response) => {
  let users: Document[] = [];
  let cursor = database
    .collection("users")
    .find({ username: { $ne: "admin" } });
  for await (let user of cursor) {
    users.push(user);
  }
  res.status(200).send(users);
});

app.get(
  "/users/:id",
  async (req: Request, res: Response, next: RequestHandler) => {
    let id = req.params["id"];
    if (ObjectId.isValid(id)) {
      res
        .status(200)
        .send(
          await database.collection("users").findOne({ _id: new ObjectId(id) }),
        );
    } else {
      throw new Error("Invalid user");
    }
  },
);

async function distributeWinnings(raceId : ObjectId) {

}

async function startRace() {
  console.log("Race start");
  let horses: Document[] = [];
  let date: Date = new Date(Date.now());
  let id: ObjectId = new ObjectId();
  let cursor = database
    .collection("horses")
    .aggregate([{ $sample: { size: 5 } }]);
  for await (let horse of cursor) {
    horses.push(horse["_id"]);
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
    let winner = horses[randomInt(horses.length)]["_id"];
    database
      .collection("races")
      .updateOne(
        { _id: id },
        { $set: { winner: winner } },
      );
    distributeWinnings(id)}, 30000);
}


}

app
  .listen(PORT, () => {
    console.log(`app listening on port ${PORT}`);
    setInterval(async () => startRace(), 30000);
  })
  .on("error", (e) => {
    throw new Error(e.message);
  });
