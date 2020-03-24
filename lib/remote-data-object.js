import {sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime, uuid} from 'mu';
import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import {SERVICE_URI} from "../app";

const READY_TO_BE_CASHED_STATUS = 'http://lblod.data.gift/file-download-statuses/ready-to-be-cached';

export class RemoteDataObject {

    constructor({uri, remote}) {
        this.uri = uri;
        this.remote = remote;
    }

    async initialize() {
        const succeeded = await RemoteDataObject.constructRemoteFromStore(this);

        if(!succeeded) {
            this.uuid = uuid();
            this.status = READY_TO_BE_CASHED_STATUS;
            this.creator = SERVICE_URI;
            this.created = new Date();
            this.modified = new Date();
        }
    }


    /**
     * Return the `RemoteDataObject` in its SPARQL form. This can be used to INSERT the object.
     *
     * @returns {string} SPARQL form of the object.
     */
    toSPARQL() {
        return `
${sparqlEscapeUri(this.uri)}    a               nfo:RemoteDataObject, nfo:fileDataObject;
                                mu:uuid         ${sparqlEscapeString(this.uuid)};
                                nie:url         ${sparqlEscapeUri(this.remote)};
                                adms:status     ${sparqlEscapeString(this.status)};
                                dct:creator     ${sparqlEscapeUri(this.creator)};
                                dct:created     ${sparqlEscapeDateTime(this.created)};
                                dct:modified    ${sparqlEscapeDateTime(this.modified)}.`
    }

    // TODO check if this function actually works
    static async process(triples) {
        console.log(">> starting processing of RemoteDataObjects <<")
        const remoteUris = triples.filter(t => t.predicate.value === "dct:part").map(triple => triple.object.value);
        const remotes = remoteUris.map(uri => {
            return new RemoteDataObject({
                uri,
                remote: triples.filter(t => (t.subject.value === uri && t.predicate.value === "nie:url"))[0]
            });
        });

        for( let remote of remotes) {
            await remote.initialize();
        }

        await RemoteDataObject.saveCollection(remotes);
    }

    /**
     * Function to save a collection of `RemoteDataObject`
     * @param remotes
     */
    static async saveCollection(remotes) {
        const q = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX adms: <http://www.w3.org/ns/adms#>
PREFIX dct: <http://purl.org/dc/terms/>
    
INSERT {
    GRAPH <http://mu.semte.ch/graphs/public> {
        ${(remotes.map(remote => remote.toSPARQL()).join('\n    '))}
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
     * Function tries to retrieve and construct the given remote from the triple-store
     *
     * @param remote empty remote with a URI
     * @returns {Promise<boolean>} if it was able to retrieve and constuct the given remote
     */
    static async constructRemoteFromStore(remote) {
        const q = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX adms: <http://www.w3.org/ns/adms#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT *
WHERE {    
    GRAPH <http://mu.semte.ch/graphs/public> {
        ${sparqlEscapeUri(remote.uri)}    a               nfo:RemoteDataObject, nfo:fileDataObject;
                                          mu:uuid         ?uuid;
                                          adms:status     ?status;
                                          dct:creator     ?creator;
                                          dct:created     ?created;
                                          dct:modified    ?modified.
                                          
    }
}`
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



