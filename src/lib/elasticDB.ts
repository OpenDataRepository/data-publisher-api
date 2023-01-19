const { Client } = require('@elastic/elasticsearch')

var client;

async function connect(path) {
  client = new Client({
    node: path
  });
};


function getClient() {
    return client;
}

export {connect, getClient}