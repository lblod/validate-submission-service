import { sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';

export async function isCKB(organisationUri) {
  const queryStr = `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    ASK {
      ${sparqlEscapeUri(organisationUri)}
        rdf:type <http://data.lblod.info/vocabularies/erediensten/CentraalBestuurVanDeEredienst> .
    }`;

  return (await querySudo(queryStr))?.boolean;
}

export async function getRelatedCKB(org) {
  const queryStr = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ere: <http://data.lblod.info/vocabularies/erediensten/>
    PREFIX reorg: <http://www.w3.org/ns/regorg#>

    SELECT DISTINCT ?ckb
    WHERE {
      ?ckb
        org:hasSubOrganization ${sparqlEscapeUri(org)} ;
        a ere:CentraalBestuurVanDeEredienst ;
        reorg:orgStatus <http://lblod.data.gift/concepts/63cc561de9188d64ba5840a42ae8f0d6> .
    }`;
  const result = (await querySudo(queryStr))?.results?.bindings || [];
  return result[0] ? result[0].ckb.value : null;
}

export async function getOrganisationFromId(organisationId) {
  const response = await querySudo(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    SELECT DISTINCT ?organisation WHERE {
      ?organisation mu:uuid ${sparqlEscapeString(organisationId)} .
    } LIMIT 1`);
  if (response?.results?.bindings?.length > 0)
    return response.results.bindings[0].organisation.value;
}

export async function getOrganisationFromSubmissionDocument(document) {
  const response = await querySudo(`
    PREFIX pav: <http://purl.org/pav/>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT DISTINCT ?org
    WHERE {
      ?submission dct:subject ${sparqlEscapeUri(document)} .
      ?submission pav:createdBy ?org .
    }
    LIMIT 1`);

  if (response?.results?.bindings?.length) {
    return response.results.bindings[0].org.value;
  }
}

export async function getOrganisationType(organisation) {
  const response = await querySudo(`
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX organisatie: <http://lblod.data.gift/vocabularies/organisatie/>

    SELECT DISTINCT ?code
    WHERE {
      ${sparqlEscapeUri(organisation)} besluit:classificatie ?code .
      ?code rdf:type organisatie:BestuurseenheidClassificatieCode .
    }
    LIMIT 1
  `);

  if (response?.results?.bindings?.length) {
    return response.results.bindings[0].code.value;
  }
}

/*
  If the decision is of one of the two following types, it doesn't matter if
  there is a CKB in between the Gemeente and the EB, even when the creator of
  the submission is a CKB. Those types allow cross references directly between
  Gemeente -> CKB and Gemeente -> EB.

  Types:
  - Schorsing beslissing eredienstbesturen
  - Opvragen bijkomende inlichtingen eredienstbesturen (met als gevolg stuiting termijn)
*/
export async function isCKBRelevantForDecisionType(decisionType) {
  const response = await querySudo(`
    PREFIX lblodBesluit: <http://lblod.data.gift/vocabularies/besluit/>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX ref: <http://lblod.data.gift/vocabularies/referencing/>
    PREFIX BestuurseenheidClassificatieCode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>

    ASK {
      ?rule
        rdf:type ref:ReferencingRule ;
        rdfs:domain ${sparqlEscapeUri(decisionType)} ;
        lblodBesluit:referredDecidableBy BestuurseenheidClassificatieCode:f9cac08a-13c1-49da-9bcb-f650b0604054 .
    }`);
  return response.boolean;
}

export async function validateCKBEBAuthorisation(referrer, ebDocumentUri) {
  const result = await querySudo(`
    PREFIX pav: <http://purl.org/pav/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    ASK {
      VALUES ?referrer { ${sparqlEscapeUri(referrer)} }
      ?submission dct:subject ${sparqlEscapeUri(ebDocumentUri)} .
      ?submission pav:createdBy ?eb .
      ?referrer org:hasSubOrganization ?eb .
    }`);
  return result?.boolean;
}

export async function validateGEBWithRelevantCKBAuthorisation(
  referrer,
  ebDocumentUri,
) {
  const result = await querySudo(`
    PREFIX pav: <http://purl.org/pav/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ere: <http://data.lblod.info/vocabularies/erediensten/>
    PREFIX dct: <http://purl.org/dc/terms/>
    ASK {
      VALUES ?referrer { ${sparqlEscapeUri(referrer)} }
      ?submission dct:subject ${sparqlEscapeUri(ebDocumentUri)} .
      ?submission pav:createdBy ?eb .
      ?betrokkenBestuur org:organization ?eb .
      ?referrer ere:betrokkenBestuur ?betrokkenBestuur .
      ?ckb org:hasSubOrganization ?eb .
    }`);
  return result?.boolean;
}

export async function validateGEBAuthorisation(referrer, ebDocumentUri) {
  const result = await querySudo(`
    PREFIX pav: <http://purl.org/pav/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ere: <http://data.lblod.info/vocabularies/erediensten/>
    PREFIX dct: <http://purl.org/dc/terms/>
    ASK {
      VALUES ?referrer { ${sparqlEscapeUri(referrer)} }
      ?submission dct:subject ${sparqlEscapeUri(ebDocumentUri)} .
      ?submission pav:createdBy ?eb .
      ?betrokkenBestuur org:organization ?eb .
      ?referrer ere:betrokkenBestuur ?betrokkenBestuur .
    }`);
  return result?.boolean;
}
