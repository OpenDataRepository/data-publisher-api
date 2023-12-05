
/**
 * Abstract Class Document.
 * Template field, template, dataset and record will all inherit from this class
 *
 * @class AbstractDocument
 */
export class BasicAbstractDocument {
  collection: any;
  state: any;

  constructor() {
    if (this.constructor == BasicAbstractDocument) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  async exists(uuid: string): Promise<boolean>{
    let cursor = await this.collection.find(
      {"uuid": uuid},
      {session: this.state?.session}
    );
    return (await cursor.hasNext());
  }

}