import {MongoClient, MongoClientOptions} from 'mongodb';

var MongoConnection;
var DB;

async function connect(path) {
    MongoConnection = await MongoClient.connect(path, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    } as MongoClientOptions);
};

async function close() {
    await MongoConnection.close();
}

function db() {
    if (DB === undefined) {
        DB = MongoConnection.db('data_publisher');
    }
    return DB;
}
function newSession() {
    return MongoConnection.startSession();
}

export {connect, close, db, newSession}