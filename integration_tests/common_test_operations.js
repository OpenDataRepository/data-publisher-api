const request = require("supertest");

module.exports = class Helper {
  constructor(app) {
    this.app = app;
  };

  templateCreate = async (data) => {
    let response = await request(this.app)
      .post('/template')
      .send(data)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    response = await request(this.app)
      .get(`/template/${response.body.inserted_uuid}/draft`)
      .set('Accept', 'application/json');
  
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);
    return response.body.uuid;
  };

}

