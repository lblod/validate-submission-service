# validate-submission-service
Microservice to construct and validate a submission harvested from a published document or sent manually.

## Getting started
### Add the service to a stack
Add the following snippet to your `docker-compose.yml`:

```yml
validate-submission:
  image: lblod/validate-submission-service
  volumes:
    - ./config/semantic-forms:/share/semantic-forms
    - ./data/files/submissions:/share/submissions
```

The volume mounted in `/share/semantic-forms` must contain all the Turtle files containing current and deprecated form definitions. We recommend adding a timestamp to the Turtle file names to differentiate them over time.

The volume mounted in `/share/submissions` must contain the Turtle files containing the data harvested from the published documents. The resulting Turtle files to fill in the forms will also be written to this folder.

Configure the delta-notification service to send notifications on the `/delta` endpoint when an automatic submission task is read for validation. Add the following snippet in the delta rules configuration of your project:

```javascript
export default [
  {
    match: {
      predicate: {
        type: 'uri',
        value: 'http://www.w3.org/ns/adms#status'
      },
      object: {
        type: 'uri',
        value: 'http://lblod.data.gift/automatische-melding-statuses/ready-for-validation'
      }
    },
    callback: {
      url: 'http://validate-submission/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: 'v0.0.1',
      gracePeriod: 1000,
      ignoreFromSelf: true
    }
  }
]
```

## Reference
### API
#### Delta handling (automatic submissions)
```
POST /delta
```
Triggers the construction and validation of a submission for a harvested publication.

The service is triggered by updates of resources of type `melding:AutomaticSubmissionTask` of which the status is updated to `http://lblod.data.gift/automatische-melding-statuses/ready-for-validation` .

The delta handling consists of 2 steps:
1. Try to fill in a Toezicht form with the harvested data
2. Auto-submit the form if it's valid and auto-submission is requested

#### Manual editing of submission documents
##### Update a submission document
```
PUT /submission-documents/:uuid

expected payload: {
 additions: '',
 removals: ''
}
```
Update a submission document based on the submitted document uuid. The additions and removals are written to TTL files. The current state of the filled in form is also written to a separate TTL file.

##### Submit a submission document
```
POST /submission-document/:uuid/submit
```
Submits a submission document if it's valid.

### Model

#### Automatic submission task
A resource describing the status and progress of the processing of an automatic submission.

##### Class
`melding:AutomaticSubmissionTask`

##### Properties
The model is specified in the [README of the automatic submission service](https://github.com/lblod/automatic-submission-service#model).
___
#### Automatic submission task statuses
Once the validation process starts, the status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/validating.

On successful completion, the status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/successful-concept or http://lblod.data.gift/automatische-melding-statuses/successful-sent, depending whether the submission landed in 'concept' or in 'sent' status.

On failure, the status is updated to http://lblod.data.gift/automatische-melding-statuses/failure.
___
#### Submission
Submission to be validated and submitted. 

##### Class
`meb:Submission`

##### Properties
For a full list of properties of a submission, we refer to the [automatic submission documentation](https://lblod.github.io/pages-vendors/#/docs/submission-annotations). The relevant properties for the validate-submission service are listed below.

| Name              | Predicate     | Range           | Definition                                     |
|-------------------|---------------|-----------------|------------------------------------------------|
| status            | `adms:status` | `skos:Concept`  | Status of the submission                       |
| submittedResource | `dct:subject` | `foaf:Document` | Document that is the subject of the submission |

#### Submission statuses
The status of a submission will be updated if the form is valid and submission is requested.

Possible statuses of a submission are:
* Concept: http://lblod.data.gift/concepts/79a52da4-f491-4e2f-9374-89a13cde8ecd: concept status in which a submission can still be modified
* Submittable: http://lblod.data.gift/concepts/f6330856-e261-430f-b949-8e510d20d0ff: status to request submission of the form is valid
* Sent: http://lblod.data.gift/concepts/9bd8d86d-bb10-4456-a84e-91e9507c374c: submission is sent and can no longer be edited

#### Submitted document
##### Class
`foaf:Document` (and `ext:SubmissionDocument`)

##### Properties
| Name   | Predicate    | Range                | Definition                                                                                 |
|--------|--------------|----------------------|--------------------------------------------------------------------------------------------|
| source | `dct:source` | `nfo:FileDataObject` | TTL files containing data about the submitted document. The TTL files have different types |

___
#### Turtle file
TTL file containing triples used to fill in a form.

##### Class
`nfo:FileDataObject`

##### Properties
| Name | Predicate    | Range                | Definition                                                                                                                                   |
|------|--------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| type | `dct:type` | `nfo:FileDataObject` | Type of the TTL file (additions, removals, meta, form, current filled in form data) |

Additional properties are specified in the model of the [file service](https://github.com/mu-semtech/file-service#resources).

Possible values of the file type are:
* http://data.lblod.gift/concepts/form-file-type: file containing the semantic form description
* http://data.lblod.gift/concepts/form-data-file-type: file containing the current filled in data of the form
* http://data.lblod.gift/concepts/additions-file-type: file containing manually added triples
* http://data.lblod.gift/concepts/removals-file-type: file containing manually removed triples
* http://data.lblod.gift/concepts/meta-file-type: file containing additonal data from the triple store to fill in and validate the form


## Related services
The following services are also involved in the automatic processing of a submission:
* [automatic-submission-service](https://github.com/lblod/automatic-submission-service)
* [download-url-service](https://github.com/lblod/download-url-service)
* [import-submission-service](https://github.com/lblod/import-submission-service)
* [enrich-submission-service](https://github.com/lblod/enrich-submission-service)
* [toezicht-flattened-form-data-generator](https://github.com/lblod/toezicht-flattened-form-data-generator)
