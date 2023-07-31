# aws-organizations-tag-inventory

This cdk project is an example of how a customer can generate a report on what tags exists and the resources they are applied to across their entire AWS organization.


## Architecture

TODO: Add architecture diagram


## Deploy

## Prerequisit
* `npm install`
* `npm run build`

### Deploy central stack
1. Put credentials on the terminal for the central account you want to send the tag inventory to and generate reports in.
2. `npm run deploy -- -c stack=central -c organizationId=<YOUR_AWS_ORGANIZATION_ID>`
3. Copy the output values for  "**CentralStackPutTagInventoryRoleOutput**" and "**OrganizationsTagInventoryBucketNameOutput**"


### Deploy spoke stack
For each account you want to gather tag inventory from do the following

1. Put credentials on the terminal for the spoke account.
2. `npm run deploy -- -c stack=spoke -c bucketName=<VALUE_FROM_OrganizationsTagInventoryBucketNameOutput> -c centralRoleArn=<VALUE_FROM_CentralStackPutTagInventoryRoleOutput>`
