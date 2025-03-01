"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongodb_1 = require("mongodb");
dotenv_1.default.config();
const app = (0, express_1.default)();
const uri = "mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.4.0";
const client = new mongodb_1.MongoClient(uri);
const database = client.db("CavalliVirtuali");
const PORT = process.env.PORT;
app.get("/", (req, res) => {
    res.status(200).send("hello world!");
});
app.get("/users/", (req, res) => {
    res
        .status(200)
        .send(database.collection("users").find({ username: { $ne: "admin" } }));
});
app
    .listen(PORT, () => {
    console.log(`example app listening on port ${PORT}`);
})
    .on("error", (e) => {
    throw new Error(e.message);
});
