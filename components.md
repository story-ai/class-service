# Story components

For want of a better location, this is a brief note of the moving parts for the
Story e-commerce application.

# AWS

Most AWS resources are managed directly by Serverless, with the exception of
the front-end resources on S3, CloudFront and Route53.  There are typically two
versions of every resource - one prefixed with `prod` and one with `dev` (or
inconsistently, sometimes `staging` or `stage`), with hopefully
self-explanatory semantics.

## Lambda 

This contains all back-end logic. In practice, this is fairly minimal - mostly
data-access from DynamoDB or CENTURY's more restricted API endpoints.  It also
communicates with Prismic, normally to join the previous data up with CMS
information.

## DynamoDB

At earlier points in the project, this contained a lot more tables. Right now,
it's just used to augment CENTURY's user model to add Discounts, a referral
code, and keep track of the user's primary Story class.

## Cloudfront

There are 4 relevant distributions right now:

* `story-ai.com` - securely serves the application client from S3 over HTTPS
* `app.staging.story-ai.com` - securely serves the staging application client from S3 over HTTPS
* `app.story-ai.com` - securely serves the _old_ application client from S3 over HTTPS (should probably be disabled)
* `edhunt.org` - securely serves an empty S3 bucket, which serves to redirect the bare `edhunt.org` domain to `www.edhunt.org`

## S3

Most of these are simple content sources for the application clients discussed in the CloudFront section: 

* `edhunt.org`: bare -> www redirect
* `specs.story-ai.com`: Contains API specifications for lambda services
* `stage.frontend.story-ai.com` -> Staging app served from CloudFront
* `story-accreditation-blobs`: Not yet used, but planned for use for Digital CV accreditations
* `story-ai.com` -> Main app served from CloudFront
* `*-serverlessdeploymentbucket-*`: A temporary bucket which Serverless creates to upload the CloudFormation spec

## CloudFormation

Serverless uses CloudFormation to orchestrate all the AWS copmonents. I don't
normally touch anything here unless something has gone wrong with deployment,
when I sometimes delete the CloudFormation stack through the console. Because
serverless uses a lower-privileged IAM role, sometimes it fails to delete stuff
via the CLI.

## Route 53

DNS for `edhunt.org`, `mynextclass.com` and `story-ai.com`. Nothing fancy.

## EC2

There shouldn't be anything still running here, but if there is, it's likely a
relic from the load-balanced cluster we used to run the ICO wordpress website
(overkill in hindsight!).
