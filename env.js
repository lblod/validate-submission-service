export const CREATOR = "http://lblod.data.gift/services/validate-submission-service";

export const TASK_ONGOING_STATUS = 'http://redpencil.data.gift/id/concept/JobStatus/busy';
export const TASK_SUCCESS_STATUS = 'http://redpencil.data.gift/id/concept/JobStatus/success';
export const TASK_FAILURE_STATUS = 'http://redpencil.data.gift/id/concept/JobStatus/failed';

export const TASK_SUCCESSFUL_CONCEPT_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/successful-concept';
export const TASK_SUCCESSFUL_SENT_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/successful-sent';

export const OPERATION_PREDICATE = 'http://redpencil.data.gift/vocabularies/tasks/operation';
export const VALIDATE_OPERATION = 'http://lblod.data.gift/id/jobs/concept/TaskOperation/validate';

export const PREFIX_TABLE = {
  meb:          'http://rdf.myexperiment.org/ontologies/base/',
  xsd:          'http://www.w3.org/2001/XMLSchema#',
  pav:          'http://purl.org/pav/',
  dct:          'http://purl.org/dc/terms/',
  melding:      'http://lblod.data.gift/vocabularies/automatische-melding/',
  lblodBesluit: 'http://lblod.data.gift/vocabularies/besluit/',
  adms:         'http://www.w3.org/ns/adms#',
  muAccount:    'http://mu.semte.ch/vocabularies/account/',
  eli:          'http://data.europa.eu/eli/ontology#',
  org:          'http://www.w3.org/ns/org#',
  elod:         'http://linkedeconomy.org/ontology#',
  nie:          'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#',
  prov:         'http://www.w3.org/ns/prov#',
  mu:           'http://mu.semte.ch/vocabularies/core/',
  foaf:         'http://xmlns.com/foaf/0.1/',
  nfo:          'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#',
  ext:          'http://mu.semte.ch/vocabularies/ext/',
  http:         'http://www.w3.org/2011/http#',
  rpioHttp:     'http://redpencil.data.gift/vocabularies/http/',
  dgftSec:      'http://lblod.data.gift/vocabularies/security/',
  dgftOauth:    'http://kanselarij.vo.data.gift/vocabularies/oauth-2.0-session/',
  wotSec:       'https://www.w3.org/2019/wot/security#',
  task:         'http://redpencil.data.gift/vocabularies/tasks/',
  asj:          'http://data.lblod.info/id/automatic-submission-job/',
  dbpedia:      'http://dbpedia.org/ontology/',
};

export const PREFIXES = (() => {
  const all = [];
  for (const key in PREFIX_TABLE)
    all.push(`PREFIX ${key}: <${PREFIX_TABLE[key]}>`);
  return all.join('\n');
})();
