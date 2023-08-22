/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
//import {Account, DescribeOrganizationCommand, OrganizationsClient, paginateListAccounts} from "@aws-sdk/client-organizations";
import {DescribeRegionsCommand, EC2Client} from "@aws-sdk/client-ec2";
import {fromIni} from "@aws-sdk/credential-providers";
import {GetCallerIdentityCommand, STSClient} from "@aws-sdk/client-sts";
import {DescribeOrganizationCommand, OrganizationsClient} from "@aws-sdk/client-organizations";
const { exec } = require("child_process");
const sharedIniFileLoader = require('@aws-sdk/shared-ini-file-loader');
const prompts = require('prompts');
const allRegions: string[] = []
let profile:string|undefined = undefined
async function chooseProfile(): Promise<string|undefined> {
	if(profile==undefined) {
		const profiles = await sharedIniFileLoader.loadSharedConfigFiles()
		const choices = Object.keys(profiles.credentialsFile).map(profileName => {
			return {title: profileName, value: profileName}
		})
		profile = (await prompts({
			type: 'select',
			name: 'profile',
			message: "Please choose a profile to use",
			choices: choices
		})).profile
	}
	return profile
}

async function getAllRegions(profile: string | undefined = undefined): Promise<string[]> {
	if (allRegions.length == 0) {
		try {
			const ec2Client = new EC2Client({
				region: 'us-east-1',
				credentials: profile != undefined ? fromIni({
					profile: profile
				}) : undefined
			})

			const describeRegionsResponse = await ec2Client.send(new DescribeRegionsCommand({
				AllRegions: true
			}))
			describeRegionsResponse.Regions!.forEach((region) => {
				allRegions.push(region.RegionName!)
			})
			return allRegions

		} catch (e) {
			const error = e as Error;
			if (error.name == "CredentialsProviderError") {

				const listProfiles = await prompts({
					type: 'select',
					name: 'shouldListProfiles',
					message: "Could not load credentials from any providers. Would you like to specify an AWS profile to use?",
					choices: [
						{title: "Yes", value: true},
						{title: "No", value: false}
					]
				})
				if (listProfiles.shouldListProfiles == true) {
					const profile = await chooseProfile()
					return await getAllRegions(profile)
				} else {
					console.error("Unable to list AWS profiles. Be sure to setup at least one profile by running `aws configure`")
					process.exit(-1)
				}
			} else if (error.name == "AuthFailure") {
				console.error("Unable to validate the provided access credentials")
				process.exit(-1)
			} else if (error.name == "RequestExpired") {
				console.error("Credentials have expired")
				process.exit(-1)
			} else {
				throw error
			}

		}
	} else {
		return allRegions
	}
}

async function chooseStack(): Promise<{ stack: string, region: string }> {
	const allRegions = await getAllRegions();
	return await prompts([{
		type: 'select',
		name: 'stack',
		message: 'Which stack would you like to deploy',
		choices: [
			{title: 'Central', description: 'This stack deploys the centralized bucket where all tag data will be written to and the bucket where the inventory reports will be generated. This stack should be deployed first and only be deployed once', value: 'central'},
			{title: 'Spoke', description: 'The stack deploy the spoke stack in the current account. It will setup a set of AWS Resource Explorer indexes and an AWS Step Function State Machine that will periodically run to gather tag inventory data and send it to the central account', value: 'spoke'},
			{title: 'Organization', description: "This will deploy the spoke stack to mulitple account within your AWS Organization.", value: "organization"}
		],
	}, {
		type: 'select',

		name: 'region',
		message: 'What region do you want to deploy to?',
		choices: allRegions.map(region => {
			return {title: region, value: region}
		})

	}]);

}

async function getCurrentAccount(region:string):Promise<string>{
 const client =	new STSClient({region:region})
 const getCallerIdentityResponse =	await client.send(new GetCallerIdentityCommand({}))
	return getCallerIdentityResponse.Account!
}

async function getOrganizationId(region:string):Promise<string>{
	const client =	new OrganizationsClient({region:region})
	const describeOrganizationCommandOutput =	await client.send(new DescribeOrganizationCommand({}))
	if(describeOrganizationCommandOutput.Organization==undefined){
		throw new Error("This solution is meant to be used with AWS Organizations. Please create an AWS organization first.")
	}else{
		return describeOrganizationCommandOutput.Organization.Id!
	}
}

async function centralStack(input:{ stack: string, region: string }): Promise<void>{
	const account = await getCurrentAccount(input.region)
	const orgId=await getOrganizationId(input.region)
	const answer=await prompts({
		type: "confirm",
		name:"confirm",
		message: `Are you sure you want to deploy the central stack to region ${input.region} in account ${account}?`,

	})
	if(answer.confirm){
		console.log("Deploying Central Stack")
		let cmd="npm run deploy -- --require-approval never"
		if(profile!=undefined){
			cmd=cmd+" --profile "+profile
		}
		cmd=cmd+" --region "+input.region+" -c stack=central -c organizationId="+orgId
		const child=exec(cmd, (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.log(`error: ${error.message}`);
				return;
			}
			if (stderr) {
				console.log(`stderr: ${stderr}`);
				return;
			}
			console.log(`stdout: ${stdout}`);
		})
		child.stdout.on('data', function(data: any) {
			console.log(data.toString());
		});

	}else{
		console.log("Goodbye")
		process.exit(0)
	}

}


(async () => {

	const stackResponse = await chooseStack()
	if(stackResponse.stack=="central"){
		await centralStack(stackResponse)
	}

})();