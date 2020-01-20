import { NamedNode, graph as rdflibGraph, parse as rdflibParse } from 'rdflib';
import { RDF, FORM, SHACL } from './semantic-forms/namespaces';
import importTriplesForForm, { fieldsForForm, validateForm, validateField } from './semantic-forms/import-triples-for-form';
import { check } from './semantic-forms/constraints';
import fs from 'fs';

const FORM_GRAPH = 'http://data.lblod.info/graphs/semantic-forms';
const META_GRAPH = 'http://data.lblod.info/graphs/meta';
const SOURCE_GRAPH = 'http://data.lblod.info/graphs/submission';

const FORM_TTL = '/data/semantic-forms/besluitenlijst.ttl';
const META_TTL = '/data/semantic-forms/codelists.ttl';

class FormBuilder {

  constructor({ fileUri, submittedResource, ttl }) {
    this.store = rdflibGraph();
    rdflibParse(this.formTtl, this.store, FORM_GRAPH, 'text/turtle');
    rdflibParse(this.metaTtl, this.store, META_GRAPH, 'text/turtle');

    if (!ttl) {
      const file = fileUri.replace('share://', '/share/');
      ttl = fs.readFileSync(file, 'utf-8');
    }
    rdflibParse(ttl, this.store, SOURCE_GRAPH, 'text/turtle');

    this._submittedResource = submittedResource;
  }

  get formTtl() {
    if (!this._formTtl) {
      this._formTtl = fs.readFileSync(FORM_TTL, 'utf-8');
    }
    return this._formTtl;
  }

  get metaTtl() {
    if (!this._metaTtl) {
      this._metaTtl = fs.readFileSync(META_TTL, 'utf-8');
    }
    return this._metaTtl;
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
 * Currently, we try to find the first form that has an exact matching value on the 'rdf:type' path.
 * This works for now, but we should find a more generic way to express the best matching form.
*/
function bestMatch(forms, options) {
  function isMatchingForm(form, options) {
    const { store, formGraph, sourceGraph, sourceNode, metaGraph } = options;
    const fields = fieldsForForm(form, options);
    const typeFields = fields.filter(field => store.holds(field, SHACL("path"), RDF("type"), formGraph));
    console.log(`Found ${typeFields.length} fields for the rdf:type path in the form`);
    const fieldValidations = typeFields.map(field => validateField(field, options));
    return fieldValidations.length && fieldValidations.reduce((acc, value) => acc && value, true);
  }

  const matchingForms = forms.filter(f => isMatchingForm(f, options));
  console.log(`Found ${matchingForms.length} matching forms based on rdf:type in the store: ${matchingForms}`);

  if (matchingForms.length) {
    return matchingForms[0];
  } else {
    return null;
  }
}

export default FormBuilder;
