import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import FormBuilder from './form-builder';
import {
  getFormTtl,
  getSourceTtl,
  getMetaTtl,
  updateDocument,
  saveFormTriples,
} from './submission-form';
import { RemoteDataObject } from './remote-data-object';
import * as env from '../env.js';
import * as config from '../config';
import * as uti from './utils';
import * as ab from './administrative-body';
import { RDF, DCT } from '@lblod/submission-form-helpers';
import { graph as rdflibGraph, NamedNode, Namespace } from 'rdflib';

const ELI = new Namespace('http://data.europa.eu/eli/ontology#');

const CONCEPT_STATUS =
  'http://lblod.data.gift/concepts/79a52da4-f491-4e2f-9374-89a13cde8ecd';
const SUBMITABLE_STATUS =
  'http://lblod.data.gift/concepts/f6330856-e261-430f-b949-8e510d20d0ff';
const SENT_STATUS =
  'http://lblod.data.gift/concepts/9bd8d86d-bb10-4456-a84e-91e9507c374c';

class Submission {
  constructor({ uri, status, submittedResource, organisationId }) {
    this.uri = uri;
    this.status = status;
    this.submittedResource = submittedResource; // submission document
    this.organisationId = organisationId;
    this.graph = config.GRAPH_TEMPLATE.replace(
      '~ORGANIZATION_ID~',
      organisationId,
    );
  }

  async updateStatus(status) {
    await update(`
      PREFIX adms: <http://www.w3.org/ns/adms#>

      DELETE {
        GRAPH ${sparqlEscapeUri(this.graph)} {
          ${sparqlEscapeUri(this.uri)} adms:status ?status .
        }
      }
      INSERT {
        GRAPH ${sparqlEscapeUri(this.graph)} {
          ${sparqlEscapeUri(this.uri)} adms:status ${sparqlEscapeUri(status)} .
        }
      } WHERE {
        GRAPH ${sparqlEscapeUri(this.graph)} {
          ${sparqlEscapeUri(this.uri)} adms:status ?status .
        }
      }
    `);
  }

  /**
   * Updates the additions and removals and processes the form
   */
  async update({ additions, removals }) {
    await updateDocument(
      this.submittedResource,
      { additions, removals },
      this.graph,
    );
    await this.process();
  }

  /**
   * Tries processing the meb:Submission, returns SENT_STATUS or CONCEPT_STATUS
   */
  async process() {
    try {
      const formTtl = await getFormTtl(this.submittedResource, this.graph);
      const metaTtl = await getMetaTtl(this.submittedResource, this.graph);
      const sourceTtl = await getSourceTtl(this.submittedResource, this.graph);
      const formBuilder = new FormBuilder({
        submittedResource: this.submittedResource,
        formTtl,
        sourceTtl,
        metaTtl,
      });
      const triples = await formBuilder.build().data();
      const formBuilderOptions = formBuilder.options;

      if (!triples.length) {
        console.log(
          `No form data could be filled in. Nothing harvested for submission <${this.uri}> with submitted resource <${this.submittedResource}>`,
        );
      }

      const isValid = await formBuilder.validate();
      console.log(
        `Form for submitted resource ${this.submittedResource} is valid: ${isValid}`,
      );

      // Validate potential cross-referencing
      let isValidCrossReferencing = true;
      const documentType = getDocumentTypeFromStore(
        this.submittedResource,
        formBuilderOptions.store,
        triples,
      );
      if (await uti.isCrossReferencingParentType(documentType)) {
        // This document is part of cross referencing.
        // A few thing to check:
        //  * do documentTypes match
        //  * is the bestuurseenheid authorised to send this document
        const referredDocuments = getCrossReferencedDocuments(
          this.submittedResource,
          triples,
        );
        const crossReferenceData = [];
        for (const referredDocument of referredDocuments) {
          crossReferenceData.push({
            submission: this.uri,
            document: this.submittedResource,
            documentType: documentType,
            referredDocument: referredDocument,
            referredDocumentType:
              await getDocumentTypeFromTriplestore(referredDocument),
          });
        }

        const referrer = await ab.getOrganisationFromId(this.organisationId);
        const referrerType = await ab.getOrganisationType(referrer);
        const isCKB = await ab.isCKB(referrer);

        for (const crossReference of crossReferenceData) {
          const referredOrg = await ab.getOrganisationFromSubmissionDocument(
            crossReference.referredDocument,
          );
          const referredOrgType = await ab.getOrganisationType(referredOrg);
          if (isCKB) {
            const predictedChildType = await uti.getCrossReferencingChildType(
              crossReference.documentType,
              referrerType,
              referredOrgType,
            );
            if (predictedChildType !== crossReference.referredDocumentType) {
              isValidCrossReferencing = false;
              break;
            }
            const validAuth = await ab.validateCKBEBAuthorisation(
              referrer,
              crossReference.referredDocument,
            );
            if (!validAuth) {
              isValidCrossReferencing = false;
              break;
            }
          } else {
            const isCKBRelevant = await ab.isCKBRelevantForDecisionType(
              crossReference.documentType,
            );
            let ckbUri;
            if (isCKBRelevant) {
              ckbUri = await ab.getRelatedCKB(referredOrg);
            }

            if (ckbUri) {
              const ckbType = await ab.getOrganisationType(ckbUri);
              const ckbExpectedDocumentType =
                await uti.getCrossReferencingChildType(
                  crossReference.documentType,
                  referrerType,
                  ckbType,
                );
              // Find the document from the CKB that refers to the document from the EB
              const referredCKBDocument =
                await findCKBDocumentReferringToEBDocument(
                  crossReference.referredDocument,
                  crossReference.referredDocumentType,
                  ckbExpectedDocumentType,
                  referredOrg,
                  ckbUri,
                );
              const referredCKBDocumentType =
                await getDocumentTypeFromTriplestore(referredCKBDocument);

              const ebExpectedDocumentType =
                await uti.getCrossReferencingChildType(
                  referredCKBDocumentType,
                  ckbType,
                  referredOrgType,
                );
              if (
                referredCKBDocumentType !== ckbExpectedDocumentType ||
                crossReference.referredDocumentType !== ebExpectedDocumentType
              ) {
                isValidCrossReferencing = false;
                break;
              }
              const validAuth =
                await ab.validateGEBWithRelevantCKBAuthorisation(
                  referrer,
                  crossReference.referredDocument,
                );
              if (!validAuth) {
                isValidCrossReferencing = false;
                break;
              }
            } else {
              const predictedChildType = await uti.getCrossReferencingChildType(
                crossReference.documentType,
                referrerType,
                referredOrgType,
              );
              if (predictedChildType !== crossReference.referredDocumentType) {
                isValidCrossReferencing = false;
                break;
              }
              const validAuth = await ab.validateGEBAuthorisation(
                referrer,
                crossReference.referredDocument,
              );
              if (!validAuth) {
                isValidCrossReferencing = false;
                break;
              }
            }
          }
        }

        console.log(
          `Cross referencing for submitted resource ${this.submittedResource} is valid: ${isValidCrossReferencing}`,
        );
      }

      const currentStatus = await getSubmissionStatus(this.uri, this.graph);
      if (!currentStatus)
        throw new Error(`Submission <${this.uri}> doesn't have a status`);

      let targetStatus = null;

      if (currentStatus === SUBMITABLE_STATUS) {
        if (!isValid || !isValidCrossReferencing) {
          console.log(
            `Resetting status of submission ${this.uri} to concept since it's invalid`,
          );
          targetStatus = CONCEPT_STATUS;
        } else {
          console.log(
            `Updating status of submission ${this.uri} to sent state since it's valid`,
          );
          await this.submit(formBuilder.form.value, triples);
          // NOTE find and save/update remote-data-objects
          await RemoteDataObject.process(triples, this.graph);
          targetStatus = SENT_STATUS;
        }
      }

      const { logicalFile } = await saveFormTriples(
        this.submittedResource,
        triples,
        this.graph,
      );

      if (targetStatus) {
        await this.updateStatus(targetStatus);
      }

      return {
        status: targetStatus == null ? currentStatus : targetStatus,
        logicalFile,
      };
    } catch (e) {
      console.log(
        `Something went wrong while processing submission ${this.uri}`,
      );
      console.log(e);
      throw e;
    }
  }

  /**
   * Submit a valid submission
   * - keep a reference to the form used to fill in form
   */
  async submit(formUri) {
    try {
      const hasType = await query(`
          PREFIX meb: <http://rdf.myexperiment.org/ontologies/base/>
          ASK {
            GRAPH ${sparqlEscapeUri(this.graph)} {
              ${sparqlEscapeUri(this.uri)} a meb:Submission .
            }
          }
        `);
      if (!hasType?.boolean)
        console.error(
          `[sentDate] Missing 'a meb:Submission' for <${this.uri}> in graph <${this.graph}>; nmo:sentDate will not be set.`,
        );

      const timestamp = new Date();
      const q = `
          PREFIX meb: <http://rdf.myexperiment.org/ontologies/base/>
          PREFIX prov: <http://www.w3.org/ns/prov#>
          PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>

          INSERT {
            GRAPH ${sparqlEscapeUri(this.graph)} {
              ${sparqlEscapeUri(this.uri)} prov:used ${sparqlEscapeUri(formUri)} ;
                                        nmo:sentDate ${sparqlEscapeDateTime(timestamp)} .
            }
          } WHERE {
            GRAPH ${sparqlEscapeUri(this.graph)} {
              ${sparqlEscapeUri(this.uri)} a meb:Submission .
            }
          }
        `;
      await update(q);

      const sentDateSet = await query(`
          PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
          ASK {
            GRAPH ${sparqlEscapeUri(this.graph)} {
              ${sparqlEscapeUri(this.uri)} nmo:sentDate ?d .
            }
          }
        `);
      if (!sentDateSet?.boolean)
        console.error(
          `[sentDate] Not set after submit for <${this.uri}> in graph <${this.graph}>.`,
        );
    } catch (e) {
      console.log(
        `Something went wrong while submitting submission ${this.uri}`,
      );
      console.log(e);
      throw e;
    }
  }
}

async function getSubmissionByTask(taskUri, reqState) {
  const response = await query(`
    ${env.PREFIXES}
    SELECT ?submission ?submissionDocument ?status
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)}
          a task:Task ;
          dct:isPartOf ?job .
        ?job prov:generated ?submission .
        ?submission
          dct:subject ?submissionDocument ;
          adms:status ?status .
      }
    } LIMIT 1
  `);

  const bindings = response?.results?.bindings;
  if (bindings && bindings.length > 0) {
    const binding = bindings[0];
    return new Submission({
      uri: binding.submission.value,
      status: binding.status.value,
      submittedResource: binding.submissionDocument.value,
      organisationId: reqState.organisationId,
    });
  }
}

async function getSubmissionBySubmissionDocument(uuid) {
  const result = await query(`
    ${env.PREFIXES}
    SELECT ?submission ?submissionDocument ?status ?organisationId
    WHERE {
      GRAPH ?g {
        ?submissionDocument mu:uuid ${sparqlEscapeString(uuid)} .
        ?submission dct:subject ?submissionDocument ;
                    adms:status ?status ;
                    pav:createdBy ?bestuurseenheid .
      }
      ?bestuurseenheid mu:uuid ?organisationId .
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return new Submission({
      uri: binding['submission'].value,
      status: binding['status'].value,
      submittedResource: binding['submissionDocument'].value,
      organisationId: binding.organisationId.value,
    });
  } else {
    return null;
  }
}

async function getSubmissionStatus(submissionUri, graph) {
  const result = await query(`
  PREFIX adms: <http://www.w3.org/ns/adms#>

  SELECT ?status
  WHERE {
    GRAPH ${sparqlEscapeUri(graph)} {
      ${sparqlEscapeUri(submissionUri)} adms:status ?status .
    }
  }
  LIMIT 1
`);

  if (result.results.bindings.length) {
    return result.results.bindings[0]['status'].value;
  } else {
    return null;
  }
}

function getDocumentTypeFromStore(documentUri, store, triples) {
  const simpleDocumentStore = rdflibGraph();
  simpleDocumentStore.addAll(triples);
  const types = simpleDocumentStore
    .match(new NamedNode(documentUri), RDF('type'), undefined)
    .map((t) => t.object);
  for (const type of types) {
    // store contains document types as meta information, in the form of Concepts. If this document type is defined, then return it.
    // This is to make sure we are not returning foaf:Document as a document type.
    if (store.any(type)) {
      return type.value;
    }
  }
}

function getCrossReferencedDocuments(documentUri, triples) {
  // am:FormData dct:relation ext:SubmissionDocument
  // or
  // ext:SubmissionDocument eli:has_part besluit:Artikel
  // besluit:Artikel eli:refers_to ext:SubmissionDocument
  const simpleDocumentStore = rdflibGraph();
  simpleDocumentStore.addAll(triples);

  const referredDocuments = simpleDocumentStore
    .match(new NamedNode(documentUri), DCT('relation'))
    .map((t) => t.object.value);

  const artikels = simpleDocumentStore
    .match(new NamedNode(documentUri), ELI('has_part'))
    .map((t) => t.object);
  for (const artikel of artikels)
    referredDocuments.push(
      ...simpleDocumentStore
        .match(artikel, ELI('refers_to'))
        .map((t) => t.object.value),
    );

  return referredDocuments;
}

async function getDocumentTypeFromTriplestore(documentUri) {
  const result = await query(`
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT DISTINCT ?documentType
    WHERE {
      ?submission dct:subject ${sparqlEscapeUri(documentUri)} .
      ?submission prov:generated ?formData .
      ?formData ext:decisionType ?documentType .
    } LIMIT 1`);
  if (result?.results?.bindings) {
    return result.results.bindings.map(
      (binding) => binding.documentType.value,
    )[0];
  }
}

async function findCKBDocumentReferringToEBDocument(
  ebDocument,
  ebDocumentType,
  ckbDocumentType,
  eb,
  ckb,
) {
  const response = await query(`
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX meb: <http://rdf.myexperiment.org/ontologies/base/>
    PREFIX pav: <http://purl.org/pav/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX ere: <http://data.lblod.info/vocabularies/erediensten/>

    SELECT DISTINCT ?ckbDocument
    WHERE {
      ?betrokkenBestuur org:organization ${sparqlEscapeUri(eb)} .
      ?eenheid ere:betrokkenBestuur ?betrokkenBestuur .
      ${sparqlEscapeUri(ckb)} org:hasSubOrganization ?eredienst.

      ?ckbSubmission
        a meb:Submission ;
        dcterms:subject ?ckbDocument ;
        pav:createdBy ${sparqlEscapeUri(ckb)} ;
        prov:generated ?formData .

      ?formData
        ext:decisionType ${sparqlEscapeUri(ckbDocumentType)} ;
        dcterms:relation ${sparqlEscapeUri(ebDocument)} .

      ?ebSubmission
        dcterms:subject ${sparqlEscapeUri(ebDocument)} ;
        pav:createdBy ${sparqlEscapeUri(eb)} ;
        prov:generated ?ebFormData .

      ?ebFormData ext:decisionType ${sparqlEscapeUri(ebDocumentType)} .
    }`);
  if (response?.results?.bindings) {
    return response.results.bindings.map(
      (binding) => binding.ckbDocument.value,
    )[0];
  }
}

export default Submission;
export {
  getSubmissionStatus,
  getSubmissionByTask,
  getSubmissionBySubmissionDocument,
  CONCEPT_STATUS,
  SUBMITABLE_STATUS,
  SENT_STATUS,
};
