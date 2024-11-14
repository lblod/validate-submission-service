import { NamedNode, graph as rdflibGraph, parse as rdflibParse } from 'rdflib';
import { RDF, FORM } from '@lblod/submission-form-helpers';
import { importTriplesForForm, validateForm } from '@lblod/submission-form-helpers';
import { registerDecisionArticlesValidator } from './field-validators/decision-articles';

const FORM_GRAPH = 'http://data.lblod.info/graphs/semantic-forms';
const META_GRAPH = 'http://data.lblod.info/graphs/meta';
const SOURCE_GRAPH = 'http://data.lblod.info/graphs/submission';

const FORM_TTL = '/data/semantic-forms/form.ttl';

class FormBuilder {
  constructor({ submittedResource, formTtl, sourceTtl, metaTtl }) {
    this.store = rdflibGraph();
    rdflibParse(formTtl, this.store, FORM_GRAPH, 'text/turtle');
    rdflibParse(metaTtl, this.store, META_GRAPH, 'text/turtle');
    rdflibParse(sourceTtl, this.store, SOURCE_GRAPH, 'text/turtle');

    this._submittedResource = submittedResource;

    registerDecisionArticlesValidator();
  }

  get formGraph() {
    return new NamedNode(FORM_GRAPH);
  }

  get metaGraph() {
    return new NamedNode(META_GRAPH);
  }

  get sourceGraph() {
    return new NamedNode(SOURCE_GRAPH);
  }

  get submittedResource() {
    return new NamedNode(this._submittedResource);
  }

  get options() {
    return {
      store: this.store,
      formGraph: this.formGraph,
      metaGraph: this.metaGraph,
      sourceGraph: this.sourceGraph,
      sourceNode: this.submittedResource
    };
  }

  build() {
    const forms = this.store
      .match(undefined, RDF("type"), FORM("Form"), this.formGraph)
      .map(t => t.subject);
    console.log(`Found ${forms.length} forms in the store`);
    this.form = bestMatch(forms, this.options);
    return this;
  }

  data() {
    if (this.hasForm())
      return importTriplesForForm(this.form, this.options);
    else
      return [];
  }

  validate() {
    if (this.hasForm() && this.form)
      return validateForm(this.form, this.options);
    else
      return false;
  }

  hasForm() {
    if (this.form == undefined) {
      console.log('No form found. Did you build it already?');
    }
    return this.form;
  }
}

/**
 * Find the best matching form for the source data
 *
 * Currently, there is only 1 form with conditional field groups per 'subform'
 * This works for now, but we should implement a strategy to handle new versions of the form
*/
function bestMatch(forms, options) {
  if (forms.length) {
    if (forms.length > 1)
      console.log(`Found ${forms.length} forms while only 1 was expected. Just taking the first one`);
    return forms[0];
  } else {
    return null;
  }
}

export default FormBuilder;
