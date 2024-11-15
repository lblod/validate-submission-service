import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeDateTime, sparqlEscapeInt, sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import { readFile, stat, writeFile } from 'node:fs/promises';
import * as env from '../env.js';

/**
 * Returns the content of the given file
 *
 * @param string file URI of the file to get the content for
*/
async function getFileContent(file) {
  console.log(`Getting contents of file ${file}`);
  const path = file.replace('share://', '/share/');
  return await readFile(path, { encoding: 'utf8' });
};

/**
 * Write the given TTL content to a file and relates it to the given submitted document
 *
 * @param string ttl Turtle to write to the file
*/
async function insertTtlFile(submissionDocument, content, graph) {
  const logicalId = uuid();
  const physicalId = uuid();
  const filename = `${physicalId}.ttl`;
  const path = `/share/submissions/${filename}`;
  const physicalUri = path.replace('/share/', 'share://');
  const logicalUri = env.PREFIX_TABLE.asj.concat(logicalId);
  const nowSparql = sparqlEscapeDateTime(new Date());

  try {
    await writeFile(path, content, { encoding: 'utf-8' });
  } catch (e) {
    console.log(`Failed to write TTL to file <${path}>.`);
    throw e;
  }

  try {
    const stats = await stat(path);
    const fileSize = stats.size;

    //Sudo required because may be called both from automatic-submission or user
    await updateSudo(`
      ${env.PREFIXES}
      INSERT {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(physicalUri)}
            a nfo:FileDataObject ;
            mu:uuid ${sparqlEscapeString(physicalId)} ;
            nie:dataSource asj:${logicalId} ;
            nfo:fileName ${sparqlEscapeString(filename)} ;
            dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} ;
            dct:format "text/turtle" ;
            nfo:fileSize ${sparqlEscapeInt(fileSize)} ;
            dbpedia:fileExtension "ttl" .

          asj:${logicalId}
            a nfo:FileDataObject;
            mu:uuid ${sparqlEscapeString(logicalId)} ;
            nfo:fileName ${sparqlEscapeString(filename)} ;
            dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} ;
            dct:format "text/turtle" ;
            nfo:fileSize ${sparqlEscapeInt(fileSize)} ;
            dbpedia:fileExtension "ttl" . 
        }
      }
      WHERE {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(submissionDocument)} a ext:SubmissionDocument .
        }
      }`);

  } catch (e) {
    console.log(`Failed to write TTL resource <${logicalUri}> to triplestore.`);
    throw e;
  }

  return { logicalFile: logicalUri, physicalFile: physicalUri };
}

async function updateTtlFile(submissionDocument, logicalFileUri, content, graph) {
  const response = await querySudo(`
    ${env.PREFIXES}
    SELECT ?physicalUri WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${sparqlEscapeUri(submissionDocument)} a ext:SubmissionDocument .
        ?physicalUri nie:dataSource ${sparqlEscapeUri(logicalFileUri)} .
      }
    }
  `);
  const physicalUri = response.results.bindings[0].physicalUri.value;
  const path = physicalUri.replace('share://', '/share/');
  const now = new Date();

  try {
    await writeFile(path, content, { encoding: 'utf-8' });
  } catch (e) {
    console.log(`Failed to write TTL to file <${path}>.`);
    throw e;
  }

  try {
    const stats = await stat(path);
    const fileSize = stats.size;

    //Sudo required because may be called both from automatic-submission or user
    await updateSudo(`
      PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      DELETE {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(physicalUri)}
            dct:modified ?modified ;
            nfo:fileSize ?fileSize .
          ${sparqlEscapeUri(logicalFileUri)}
            dct:modified ?modified ;
            nfo:fileSize ?fileSize .
        }
      }
      INSERT {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(physicalUri)}
            dct:modified ${sparqlEscapeDateTime(now)} ;
            nfo:fileSize ${sparqlEscapeInt(fileSize)} .
          ${sparqlEscapeUri(logicalFileUri)}
            dct:modified ${sparqlEscapeDateTime(now)} ;
            nfo:fileSize ${sparqlEscapeInt(fileSize)} .
        }
      }
      WHERE {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(submissionDocument)} a ext:SubmissionDocument .
        }
      }
  `);

  } catch (e) {
    console.log(`Failed to update TTL resource <${logicalFileUri}> in triplestore.`);
    throw e;
  }
}

export {
  getFileContent,
  insertTtlFile,
  updateTtlFile
}
