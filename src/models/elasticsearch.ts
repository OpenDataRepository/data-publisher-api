const ElasticDB = require('../lib/elasticDB');

var client;
var all_indexes_prefix;
var published_dataset_prefix;

function init() {
  client = ElasticDB.getClient();
  all_indexes_prefix = process.env.elasticsearchIndexPrefix;
  published_dataset_prefix = all_indexes_prefix + 'publisheddataset_';
}

function publishedDatasetIndex(uuid, name) {
  return published_dataset_prefix + uuid + '_' + name;
}

async function createPublishedDatasetIndex(uuid: string, name: string, records) {
  let index = publishedDatasetIndex(uuid, name);
  if(records.length > 0) {
    let bulk_body: any = [];
    for (let record of records) {
      record.id = record._id;
      delete record._id;
      bulk_body.push({
        index: {
          _index: index,
          _id: record.id
        }
      });
      bulk_body.push(record);
    }
    try {
      let response = await client.bulk({
        body : bulk_body
      });
      // console.log('elastic search bulk index response:' + response);
    } catch (e) {
      console.log('elastic search bulk index failed:' + e);
    }
  } else {
    try {
      let response = await client.indices.create({index})
      // console.log('elastic search create empty index response:' + response);
    } catch (e) {
      console.log('elastic search create empty index failed:' + e);
    }
  }
}

async function searchPublishedDatasetIndex(uuid: string, name: string, input_query) {
  let index = publishedDatasetIndex(uuid, name);

  client.indices.refresh({index});

  console.log('query: ' + JSON.stringify(input_query));

  let search_body: any = {index};
  if(Object.keys(input_query).length !== 0) {
    let query: any = {
      bool: {
        must: []
      }
    };
    for(const key in input_query) {
      const value = input_query[key];
      query.bool.must.push({match: {[key]: value}})
    }
    search_body.query = query;
  } else {
    search_body.query = {"match_all": {}};
  }
  console.log(JSON.stringify(search_body));
  let response = await client.search(search_body);

  let search_results = response.hits.hits;
  let records = search_results.map(record => {
    let new_record = record._source;
    new_record._id = new_record.id;
    delete new_record.id;
    return new_record;
  })
  return records;
}
 
export {
  init,
  createPublishedDatasetIndex,
  searchPublishedDatasetIndex
}
