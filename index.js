import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import joi from "joi";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect(() => {
    db = mongoClient.db(process.env.DATABASE);
});

const userSchema = joi.object({
    name: joi.string().required()
});

const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid("message", "private_message")
});

const server = express();
server.use(cors());
server.use(json());

setInterval(async () => {
    const dateNow = Date.now() - 10000;

    const participants = await db.collection("users").find({ lastStatus: { $lte: dateNow } }).toArray();
    const offlineParticipantsStatusMsg = participants.map(participant => {
        return {
            from: participant.name,
            to: "Todos",
            text: "sai da sala...",
            type: "status",
            time: `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`
        }
    })
    if (offlineParticipantsStatusMsg.length > 0) {
        await db.collection("users").deleteMany({ lastStatus: { $lte: dateNow } });
        await db.collection("messages").insertMany(offlineParticipantsStatusMsg);
    }
}, 15000);


server.post("/participants", async (req, res) => {
    const { name } = req.body;
    const validation = userSchema.validate(req.body);

    if (validation.error) {
        res.sendStatus(422);
        return;
    }

    try {
        const participantAlreadyExists = await db.collection("users").findOne({ name: name });
        if (participantAlreadyExists) {
            res.sendStatus(409);
            return;
        }

        const newParticipant = {
            name: name,
            lastStatus: Date.now()
        };
        await db.collection("users").insertOne(newParticipant);

        const newStatusMessage = {
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`
        }
        await db.collection("messages").insertOne(newStatusMessage);

        res.sendStatus(201);
    } catch (error) {
        res.sendStatus(500);
    }
});


server.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("users").find().toArray();
        res.send(participants).status(200);
    } catch (error) {
        res.sendStatus(500);
    }
});


server.post("/messages", async (req, res) => {
    const { user } = req.headers;

    try {
        const validation = messageSchema.validate(req.body);
        const messageAuthor = await db.collection("users").findOne({ name: user });
        if (validation.error || !messageAuthor) {
            res.sendStatus(422);
            return;
        }
        await db.collection("messages").insertOne({
            ...req.body,
            from: user,
            time: `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`
        });
        res.sendStatus(201);
    } catch (error) {
        res.sendStatus(500);
    }
});

server.get("/messages", async (req, res) => {
    const { user } = req.headers;
    const { limit } = req.query;

    try {
        const allMessages = await db.collection("messages").find({
            $or: [{ to: { $in: [user, "Todos"] } }, { from: user }]
        }).toArray();

        if (limit && allMessages.length > limit) {
            allMessages.splice(0, allMessages.length - limit);
            res.send(allMessages).status(200);
            return;
        }
        res.send(allMessages).status(200);
    } catch (error) {
        res.sendStatus(500);
    }
});

server.post("/status", async (req, res) => {
    const { user } = req.headers;
    try {
        const userIsOnline = await db.collection("users").findOne({ name: user });
        if (!userIsOnline) {
            res.sendStatus(404);
            return;
        }
        await db.collection("users").updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
});

server.listen(5000, () => console.log("Servidor Operacional"));