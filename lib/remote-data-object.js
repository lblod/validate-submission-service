import {sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime, uuid} from 'mu';
import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import {SERVICE_URI} from "../app";
import {NIE} from "./semantic-forms/namespaces";

const DOWNLOAD_STATUS_READY_TO_BE_CASHED = 'http://lblod.data.gift/file-download-statuses/ready-to-be-cached';

export class RemoteDataObject {

  constructor({uri, url}) {
    this.uri = uri;
    this.url = url;
  }

  /**
   * initializes a `RemoteDataObject`.
   * example usage: `await new RemoteDataObject({uri, url}).init()`
   *
   *  - will try to construct the `RemoteDataObject` with the provide URI and URL using the triple-store.
   *  - if nothing was found in the triple-store, we create a new (default) `RemoteDataObject`.
   */
  async init() {
    this.exists = await RemoteDataObject.constructRemoteFromStore(this);

    if (!this.exists) {
      this.uuid = uuid();
      this.status = DOWNLOAD_STATUS_READY_TO_BE_CASHED;
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
                                nie:url         ${sparqlEscapeUri(this.url)};
                                adms:status     ${sparqlEscapeUri(this.status)};
                                dct:creator     ${sparqlEscapeUri(this.creator)};
                                dct:created     ${sparqlEscapeDateTime(this.created)};
                                dct:modified    ${sparqlEscapeDateTime(this.modified)}.`
  }

  /**
   * Function will extract valid candidates for `RemoteDataObject` and save them to the triple-store.
   *
   * @param triples in witch it could find candidates for `RemoteDataObject`.
   */
  static async process(triples) {
    const remotes = triples.filter(t => t.predicate.value === NIE('url').value)
      .map(t => {
        return new RemoteDataObject({
          uri: t.subject.value,
          url: t.object.value
        });
      });

    for (let remote of remotes) {
      await remote.init();
    }

    remotes.filter(remote => !remote.exists);

    if(remotes.length > 0) await RemoteDataObject.saveCollection(remotes);
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
                                          nie:url         ?url; 
                                          adms:status     ?status;
                                          dct:creator     ?creator;
                                          dct:created     ?created;
                                          dct:modified    ?modified.
                                          
    }
}`
    const result = await query(q);
    if (result.results.bindings.length) {
      const binding = result.results.bindings[0];
      remote.uuid = binding['uuid'].value;
      remote.url = binding['url'].value;
      remote.status = binding['status'].value;
      remote.creator = binding['creator'].value;
      remote.created = new Date(binding['created'].value);
      remote.modified = new Date(binding['modified'].value);
      return true;
    } else {
      return false;
    }
  }
}



