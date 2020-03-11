# validate-submission-service
Microservice to construct and validate a submission harvested from a published document or sent manually.

## Installation
Add the following snippet to your `docker-compose.yml`:

```yml
validate-submission:
  image: lblod/validate-submission-service
  volumes:
    - ./data/files/submissions:/share/submissions
    - ./data/semantic-forms:/data/semantic-forms
```

The volume mounted in `/share/submissions` must contain the Turtle files containing the data harvested from the published documents. The resulting Turtle files to fill in the forms will also be written to this folder.

The volume mounted in `/data/semantic-forms` must contain the description of the Toezicht forms in Turtle format.

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

## API

### Delta handling (automatic submissions)
```
POST /delta
```
Triggers the construction and validation of a submission for a harvested publication.

The service is triggered by updates of resources of type `melding:AutomaticSubmissionTask` of which the status is updated to `http://lblod.data.gift/automatische-melding-statuses/ready-for-validation` .

The delta handling consists of 2 steps:
1. Try to fill in a Toezicht form with the harvested data
2. Auto-submit the form if it's valid and auto-submission is requested

### Manual editing of submission documents
#### Update a submission document
```
PUT /submission-documents/:uuid

expected payload: {
 additions: '',
 removals: ''
}
```
Update a submission document based on the submitted document uuid. The additions and removals are written to TTL files. The current state of the filled in form is also written to a separate TTL file.

#### Submit a submission document
```
POST /submission-document/:uuid/submit
```
Submits a submission document if it's valid.

## Model

### Automatic submission task
A resource describing the status and progress of the processing of an automatic submission.

#### Class
`melding:AutomaticSubmissionTask`

#### Properties
The model is specified in the [README of the automatic submission service](https://github.com/lblod/automatic-submission-service#model).

### Automatic submission task statuses
Once the validation process starts, the status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/validating.

On successful completion, the status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/successful-concept or http://lblod.data.gift/automatische-melding-statuses/successful-sent, depending whether the submission landed in 'concept' or in 'sent' status.

On failure, the status is updated to http://lblod.data.gift/automatische-melding-statuses/failure.

## Related services
The following services are also involved in the automatic processing of a submission:
* [automatic-submission-service](https://github.com/lblod/automatic-submission-service)
* [download-url-service](https://github.com/lblod/download-url-service)
* [import-submission-service](https://github.com/lblod/import-submission-service)
* [enrich-submission-service](https://github.com/lblod/enrich-submission-service)
