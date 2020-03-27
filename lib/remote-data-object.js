import {sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime, uuid} from 'mu';
import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import {SERVICE_URI} from "../app";
import {DCT, NIE} from "./semantic-forms/namespaces";

const READY_TO_BE_CACHED_STATUS = 'http://lblod.data.gift/file-download-statuses/ready-to-be-cached';

export class RemoteDataObject {

  constructor({uri, address}) {
    this.uri = uri;
    this.address = address;
  }

  /**
   * initializes a `RemoteDataObject`.
   * example usage: `await new RemoteDataObject({uri, address}).init()`
   *
   *  - will try to construct the `RemoteDataObject` with the provide URI and address using the triple-store.
   *  - if nothing was found in the triple-store, we create a new (default) `RemoteDataObject`.
   */
  async init() {
    const succeeded = await RemoteDataObject.constructRemoteFromStore(this);

    if (!succeeded) {
      this.uuid = uuid();
      this.status = READY_TO_BE_CACHED_STATUS;
      this.creator = SERVICE_URI;
      this.created = new Date();
      this.modified = new Date();
    }
  }


  /**
   * Return the `RemoteDataObject` in its SPARQL form. This can be used to INSERT the object.
   *
   * @returns SPARQL form of the `RemoteDataObject`.
   */
  toSPARQL() {
    return `
${sparqlEscapeUri(this.uri)}    a               nfo:RemoteDataObject, nfo:FileDataObject;
                                mu:uuid         ${sparqlEscapeString(this.uuid)};
                                nie:url         ${sparqlEscapeUri(this.address)};
                                adms:status     ${sparqlEscapeUri(this.status)};
                                dct:creator     ${sparqlEscapeUri(this.creator)};
                                dct:created     ${sparqlEscapeDateTime(this.created)};
                                dct:modified    ${sparqlEscapeDateTime(this.modified)}.`;
  }

  /**
   * Function will extract valid candidates for `RemoteDataObject` and save them to the triple-store.
   *
   * @param triples in witch it could find candidates for `RemoteDataObject`.
   */
  static async process(triples) {
    const addresses = triples.filter(t => t.predicate.equals(NIE('url')));
    const remotes = addresses
      .map(uri => {
        return new RemoteDataObject({
          uri: uri.subject.value,
          address: uri.object.value
        });
      });

    for (let remote of remotes) {
      await remote.init();
    }

    await RemoteDataObject.saveCollection(remotes);
  }

  /**
   * Function to save a collection of `RemoteDataObject` to the triple-store.
   *
   * @param remotes collection of `RemoteDataObject` objects.
   */
  static async saveCollection(remotes) {
    const q = `
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX adms: <http://www.w3.org/ns/adms#>
PREFIX dct: <http://purl.org/dc/terms/>

INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/public> {
        ${(remotes.map(remote => remote.toSPARQL()).join('\n    '))}
    }
}`

    try {
      await update(q);
    } catch (e) {
      console.log(`Something went wrong while updating/saving the remote-data-objects`);
      console.log(e);
      throw e;
    }
  }

  /**
   * Function tries to retrieve and construct the given `RemoteDataObject` using the URI
   * from the triple-store.
   *
   * @param remote `RemoteDataObject` with a valid URI.
   * @returns {Promise<boolean>} if it was able to retrieve and construct the given `RemoteDataObject`
   */
  static async constructRemoteFromStore(remote) {
    const q = `
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX adms: <http://www.w3.org/ns/adms#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT *
WHERE {
    GRAPH <http://mu.semte.ch/graphs/public> {
        ${sparqlEscapeUri(remote.uri)}    a               nfo:RemoteDataObject, nfo:FileDataObject;
                                          mu:uuid         ?uuid;
                                          adms:status     ?status;
                                          dct:creator     ?creator;
                                          dct:created     ?created;
                                          dct:modified    ?modified.

    }
}`;
    const result = await query(q);

    if (result.results.bindings.length) {
      const binding = result.results.bindings[0];

      remote.uuid = binding['binding'].value;
      remote.status = binding['status'].value;
      remote.creator = binding['creator'].value;
      remote.created = binding['created'].value;
      remote.modified = binding['modified'].value;


      return true;
    } else {
      return false;
    }
  }
}
