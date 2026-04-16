import { sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';

export async function isCKB(organisationUri) {
  const queryStr = `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    ASK {
      ${sparqlEscapeUri(organisationUri)}
        rdf:type <http://data.lblod.info/vocabularies/erediensten/CentraalBestuurVanDeEredienst> .
    }`

  return (await querySudo(queryStr))?.boolean;
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

/*
  If the decision is of one of the two following types, it doesn't matter if
  there is a CKB in between the Gemeente and the EB, even when the creator of
  the submission is a CKB. Those types allow cross references directly between
  Gemeente -> CKB and Gemeente -> EB.

  Types:
  - Schorsing beslissing eredienstbesturen
  - Opvragen bijkomende inlichtingen eredienstbesturen (met als gevolg stuiting termijn)
*/
export function isCKBRelevantForDecisionType(decisionType) {
  return decisionType !== "https://data.vlaanderen.be/id/concept/BesluitDocumentType/24743b26-e0fb-4c14-8c82-5cd271289b0e"
    && decisionType !== "https://data.vlaanderen.be/id/concept/BesluitType/b25faa84-3ab5-47ae-98c0-1b389c77b827";
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

export async function validateGEBWithRelevantCKBAuthorisation(referrer, ebDocumentUri) {
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
