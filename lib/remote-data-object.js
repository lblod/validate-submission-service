import { sparqlEscapeString, sparqlEscapeDateTime, uuid, sparqlEscapeUri } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { SERVICE_URI } from '../app';
import { NIE } from '@lblod/submission-form-helpers';

const DOWNLOAD_STATUS_READY_TO_BE_CASHED = 'http://lblod.data.gift/file-download-statuses/ready-to-be-cached';

export class RemoteDataObject {

  /**
   * Function will extract valid candidates for remote-data-objects
   * and save them to the triple-store.
   *
   * NOTE: We retain a "no mercy" policy.
   *       This means that existing remote-data-objects for a given URI will be cleared.
   *
   * @param triples that could contain candidates for `RemoteDataObject`.
   */
  static async process(triples) {
    const candidates = triples.filter(t => t.predicate.value === NIE('url').value)
                              .map(({subject, object}) => Object.create({
                                uri: subject.value,
                                address: object.value
                              }));
    await RemoteDataObject.clearCollection(candidates);
    await RemoteDataObject.saveCollection(candidates);
  }

  /**
   * Clear all existing data for the given URI
   *
   * @param remotes
   * @returns {Promise<void>}
   */
  static async clearCollection(remotes) {
    for (let {uri} of remotes) {
      await update(`
        DELETE WHERE { 
            GRAPH <http://mu.semte.ch/graphs/public> { ${sparqlEscapeUri(uri)} ?p ?o . } 
        }
      `);
      await update(`
        DELETE WHERE { 
            GRAPH <http://mu.semte.ch/graphs/public> { ?s ?p ${sparqlEscapeUri(uri)} . } 
        }
      `);
    }
  }

  /**
   * Function to update a collection of remote-data-objects to the triple-store.
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
        ${(remotes.map(remote => new RemoteDataObject(remote).toSPARQL()).join('\n    '))}
    }
}`;

    try {
      await update(q);
    } catch (e) {
      console.log(`Something went wrong while updating/saving the remote-data-objects`);
      console.log(e);
      throw e;
    }
  }

  constructor({uri, address}) {
    this.uri = uri;
    this.address = address;
    this.uuid = uuid();
    this.status = DOWNLOAD_STATUS_READY_TO_BE_CASHED;
    this.creator = SERVICE_URI;
    this.created = new Date();
    this.modified = new Date();
  }

  /**
   * Return the `RemoteDataObject` in its SPARQL form. This can be used to INSERT the object.
   *
   * @returns SPARQL form of the `RemoteDataObject`.
   */
  toSPARQL() {
    return `${sparqlEscapeUri(this.uri)}  a nfo:RemoteDataObject, nfo:FileDataObject;
                                mu:uuid         ${sparqlEscapeString(this.uuid)};
                                nie:url         ${sparqlEscapeUri(this.address)};
                                adms:status     ${sparqlEscapeUri(this.status)};
                                dct:creator     ${sparqlEscapeUri(this.creator)};
                                dct:created     ${sparqlEscapeDateTime(this.created)};
                                dct:modified    ${sparqlEscapeDateTime(this.modified)}.`;
  }
}
