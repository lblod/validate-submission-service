import {
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
  sparqlEscapeUri,
} from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import * as cts from '../automatic-submission-flow-tools/constants.js';
import { NIE } from '@lblod/submission-form-helpers';

const DOWNLOAD_STATUS_READY_TO_BE_CASHED =
  'http://lblod.data.gift/file-download-statuses/ready-to-be-cached';

export class RemoteDataObject {
  /**
   * Function will extract valid candidates for remote-data-objects
   * and save them to the triple-store.
   *
   * NOTE: We retain a "no mercy" policy.
   *       This means that existing remote-data-objects for a given URI will be cleared.
   *       A URL could become out of sync with its cached file (because e.g user edited the source), hence they are re-scheduled again.
   *       Note: we don't want this for RemoteDataObjects created by automatic submission, because:
   *       - This could 'corrupt' the information about the source it is coming from
   *       - At creation of automatic sumbission, it might contain authentication information that is thrown away once a RemoteDataObject
   *         got downloaded.
   *       - The current implementation has still room for a bug: i.e. what about manually added (and then edited) remote-data object.
   *          - this will be skipped. This will be tackled in a next issue
   *
   * @param triples that could contain candidates for `RemoteDataObject`.
   */
  static async process(triples) {
    const candidates = triples
      .filter((t) => t.predicate.value === NIE('url').value)
      .map(({ subject, object }) =>
        Object.create({
          uri: subject.value,
          address: object.value,
        })
      );

    const toReSchedule = [];
    for (const candidate of candidates) {
      if (
        !(await RemoteDataObject.wasCreatedByAutomaticSubmission(candidate.uri))
      ) {
        toReSchedule.push(candidate);
      }
    }

    console.log(`Rescheduling ${toReSchedule.length} URL's for download.`);
    if (toReSchedule.length) {
      await RemoteDataObject.clearCollection(toReSchedule);
      await RemoteDataObject.saveCollection(toReSchedule);
    }
  }

  static async wasCreatedByAutomaticSubmission(remoteDataObject) {
    const queryStr = `
      PREFIX nie:   <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX melding:   <http://lblod.data.gift/vocabularies/automatische-melding/>
      PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>

      ASK {
        ?s nie:hasPart ${sparqlEscapeUri(remoteDataObject)}.
        ?fo prov:generatedBy ?s.
        ?fo a <http://vocab.deri.ie/cogs#Job>;
          task:operation
            <http://lblod.data.gift/id/jobs/concept/JobOperation/automaticSubmissionFlow>.
      }
   `;
    const result = await query(queryStr);
    return result.boolean;
  }

  /**
   * Clear all existing data for the given URI
   *
   * @param remotes
   * @returns {Promise<void>}
   */
  static async clearCollection(remotes) {
    for (let { uri } of remotes) {
      await update(`
        DELETE WHERE {
          GRAPH <http://mu.semte.ch/graphs/public> {
            ${sparqlEscapeUri(uri)} ?p ?o .
          }
        }
      `);
      await update(`
        DELETE WHERE {
          GRAPH <http://mu.semte.ch/graphs/public> {
            ?s ?p ${sparqlEscapeUri(uri)} .
          }
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
    const remotesTriples = remotes
      .map((remote) =>
        new RemoteDataObject(remote.uri, remote.address).toSPARQL()
      )
      .join('\n    ');
    const q = `
      PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
      PREFIX adms: <http://www.w3.org/ns/adms#>
      PREFIX dct: <http://purl.org/dc/terms/>

      INSERT DATA {
        GRAPH <http://mu.semte.ch/graphs/public> {
          ${remotesTriples}
        }
      }`;

    try {
      await update(q);
    } catch (e) {
      console.log(
        'Something went wrong while updating/saving the remote-data-objects'
      );
      console.log(e);
      throw e;
    }
  }

  constructor(uri, address) {
    this.uri = uri;
    this.address = address;
    this.uuid = uuid();
    this.status = DOWNLOAD_STATUS_READY_TO_BE_CASHED;
    this.creator = cts.SERVICES.validateSubmission;
    this.created = new Date();
    this.modified = new Date();
  }

  /**
   * Return the `RemoteDataObject` in its SPARQL form. This can be used to INSERT the object.
   *
   * @returns SPARQL form of the `RemoteDataObject`.
   */
  toSPARQL() {
    return `
      ${sparqlEscapeUri(this.uri)}
        a nfo:RemoteDataObject, nfo:FileDataObject ;
        mu:uuid ${sparqlEscapeString(this.uuid)} ;
        nie:url ${sparqlEscapeUri(this.address)} ;
        adms:status ${sparqlEscapeUri(this.status)} ;
        dct:creator ${sparqlEscapeUri(this.creator)} ;
        dct:created ${sparqlEscapeDateTime(this.created)} ;
        dct:modified ${sparqlEscapeDateTime(this.modified)} .`;
  }
}
