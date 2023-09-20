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
import {DescribeRegionsCommand, EC2Client} from '@aws-sdk/client-ec2';
import {GetRoleCommand, IAMClient} from '@aws-sdk/client-iam';
import {DescribeOrganizationCommand, ListRootsCommand, Organization, OrganizationalUnit, OrganizationsClient, paginateListOrganizationalUnitsForParent} from '@aws-sdk/client-organizations';
import {Group, paginateListGroups, paginateListUsers, QuickSightClient, User} from '@aws-sdk/client-quicksight';
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import {GetCallerIdentityCommand, STSClient} from '@aws-sdk/client-sts';
import {fromIni} from '@aws-sdk/credential-providers';
import {execSync} from "child_process";
import {ScheduleExpression} from "./constructs/ScheduleExpression";


const sharedIniFileLoader = require('@smithy/shared-ini-file-loader');
const prompts = require('prompts');
const allRegions: string[] = [];
let profile: string | undefined = undefined;

async function chooseProfile(): Promise<string | undefined> {
	if (profile == undefined) {
		const profiles = await sharedIniFileLoader.loadSharedConfigFiles();
		const choices = Object.keys(profiles.credentialsFile).map(profileName => {
			return {title: profileName, value: profileName};
		});
		profile = (await prompts({
			type: 'select',
			name: 'profile',
			message: 'Please choose a profile to use',
			choices: choices,
		})).profile;
	}
	return profile;
}

async function getAllRegions(profile: string | undefined = undefined): Promise<string[]> {
	if (allRegions.length == 0) {
		try {
			const ec2Client = new EC2Client({
				region: 'us-east-1',
				credentials: profile != undefined ? fromIni({
					profile: profile,
				}) : undefined,
			});

			const describeRegionsResponse = await ec2Client.send(new DescribeRegionsCommand({
				AllRegions: true,
			}));
			describeRegionsResponse.Regions!.forEach((region) => {
				allRegions.push(region.RegionName!);
			});

			return allRegions.sort();

		} catch (e) {
			const error = e as Error;
			if (error.name == 'CredentialsProviderError') {

				const listProfiles = await prompts({
					type: 'select',
					name: 'shouldListProfiles',
					message: 'Could not load credentials from any providers. Would you like to specify an AWS profile to use?',
					choices: [
						{title: 'Yes', value: true},
						{title: 'No', value: false},
					],
				});
				if (listProfiles.shouldListProfiles == true) {
					const profile = await chooseProfile();
					return await getAllRegions(profile);
				} else {
					console.error('Goodbye');
					process.exit(-1);
				}
			} else if (error.name == 'AuthFailure') {
				console.error('Unable to validate the provided access credentials');
				process.exit(-1);
			} else if (error.name == 'RequestExpired') {
				const listProfiles = await prompts({
					type: 'select',
					name: 'shouldListProfiles',
					message: 'Credentials have expired. Would you like to specify another AWS profile to use?',
					choices: [
						{title: 'Yes', value: true},
						{title: 'No', value: false},
					],
				});
				if (listProfiles.shouldListProfiles == true) {
					const profile = await chooseProfile();
					return await getAllRegions(profile);
				} else {
					console.error('Goodbye');
					process.exit(-1);
				}

			} else {
				throw error;
			}

		}
	} else {
		return allRegions;
	}
}

async function checkBootstrap(account: string, region: string): Promise<any> {
	const ssmclient = new SSMClient({region});
	try {
		const response = await ssmclient.send(new GetParameterCommand({
			Name: '/cdk-bootstrap/hnb659fds/version',
		}));
		console.info(`CDK Environment v${response.Parameter?.Value}`);
	} catch (e) {
		const error = e as Error;
		if (error.name == "ParameterNotFound") {
			const boostrapConfirmation = await prompts([{
				type: 'confirm',
				name: 'shouldBootstrap',
				message: `It does not appear that you have bootstrapped CDK for region ${region}, would you like to bootstrap now?`,
			}]);
			if (boostrapConfirmation.shouldBootstrap) {
				const cmd = `cdk bootstrap aws://${account}/${region}`
				console.info(`Running ${cmd}`)
				execSync(cmd, {
					cwd: "..",
					stdio: 'inherit'
				})
			} else {
				console.error(`You must run cdk bootstrap for the region you'd like to deploy to.`);
				process.exit(-1)
			}
		} else {
			console.error(`Problem checking CDK bootstrap status: ${error.name} - ${error.message}`);
			process.exit(-1)
		}

	}
}

async function chooseStack(): Promise<{ account: string, stack: string; region: string, schedule: string}> {
	const allRegions = await getAllRegions();

	const input = await prompts([{
		type: 'select',
		name: 'stack',
		message: 'Which stack would you like to deploy',
		choices: [
			{title: 'Central', description: 'This stack deploys the centralized bucket where all tag data will be written to and the bucket where the inventory reports will be generated. This stack should be deployed first and only be deployed once', value: 'central'},
			{title: 'Spoke', description: 'The stack deploy the spoke stack in the current account. It will setup a set of AWS Resource Explorer indexes and an AWS Step Function State Machine that will periodically run to gather tag inventory data and send it to the central account', value: 'spoke'},
			{title: 'Organization', description: 'This will deploy the spoke stack to multiple accounts within your AWS Organization. Must be run from the organization payer account.', value: 'organization'},
		],
	}, {
		type: 'select',

		name: 'region',
		message: 'What region do you want to deploy to?',
		choices: allRegions.map(region => {
			return {title: region, value: region};
		}),

	}, {
		type: 'select',

		name: 'schedule',
		message: 'What schedule do you want jobs to run on?',
		choices: [ScheduleExpression.DAILY, ScheduleExpression.WEEKLY, ScheduleExpression.MONTHLY].map(schedule => {
			return {title: schedule, value: schedule};
		}),

	}]);
	const account = await getCurrentAccount(input.region)
	await checkBootstrap(account, input.region);
	return {
		account: account,
		...input
	};
}

async function getCurrentAccount(region: string): Promise<string> {
	const client = new STSClient({region: region});
	const getCallerIdentityResponse = await client.send(new GetCallerIdentityCommand({}));
	return getCallerIdentityResponse.Account!;
}

async function getOrganization(region: string, client: OrganizationsClient = new OrganizationsClient({region: region})): Promise<Organization> {
	const describeOrganizationCommandOutput = await client.send(new DescribeOrganizationCommand({}));
	if (describeOrganizationCommandOutput.Organization == undefined) {
		throw new Error('This solution is meant to be used with AWS Organizations. Please create an AWS organization first.');
	} else {
		return describeOrganizationCommandOutput.Organization;
	}
}

async function getAllOus(region: string, client: OrganizationsClient = new OrganizationsClient({region: region}), parent: OrganizationalUnit): Promise<OrganizationalUnit[]> {

	const ous: OrganizationalUnit[] = [parent];
	const paginatedOus = paginateListOrganizationalUnitsForParent({
		client: client,
	}, {
		ParentId: parent?.Id,
	});
	for await (const page of paginatedOus) {
		if (page.OrganizationalUnits != undefined) {
			for (const ou of page.OrganizationalUnits) {

				ous.push(...(await getAllOus(region, client, ou)));
			}
		}
	}
	return ous;
}


async function getQuickSightUsersAndGroups(input: { account: string, stack: string; region: string }): Promise<{ users: User[], groups: Group[] }> {
	try {

		const users: User[] = []
		const groups: Group[] = []
		const qsClient = new QuickSightClient({region: input.region});
		const qsUsersPaginator = paginateListUsers({
			client: qsClient,
		}, {
			AwsAccountId: input.account,
			Namespace: 'default',

		});

		for await (const page of qsUsersPaginator) {
			if (page.UserList != undefined) {
				for (const user of page.UserList) {
					users.push(user);
				}
			}
		}

		const qsGroupsPaginator = paginateListGroups({
			client: qsClient,
		}, {
			AwsAccountId: input.account,
			Namespace: 'default',

		});
		for await (const page of qsGroupsPaginator) {
			if (page.GroupList != undefined) {
				for (const group of page.GroupList) {
					groups.push(group);
				}
			}
		}
		return {
			users: users,
			groups: groups
		}
	} catch (e) {
		const error = e as Error
		if (error.name == "AccessDeniedException") {
			const results = new RegExp(/Please use the ([\w-\d]*) endpoint\./).exec(error.message)
			if (results != null && results.length == 2) {
				console.warn(error.message + ` Attempting to query region ${results[1]}`)
				return await getQuickSightUsersAndGroups({
					region: results[1],
					account: input.account,
					stack: input.stack
				})
			} else {
				console.error(`Problem gather QuickSight users and groups: ${error.name} - ${error.message}`)
				process.exit(-1)
			}
		} else {
			console.error(`Problem gather QuickSight users and groups: ${error.name} - ${error.message}`)
			process.exit(-1)
		}
	}
}

async function centralStack(input: { account: string, stack: string; region: string, schedule: string }): Promise<void> {
	const account = input.account
	const organization = await getOrganization(input.region);
	const quicksightConfirmation = await prompts([{
		type: 'confirm',
		name: 'deployQuickSight',
		message: 'Would you like to use QuickSight to visualize your tag inventory data?',
	}]);
	const users: User[] = [];
	const groups: Group[] = [];
	if (quicksightConfirmation.deployQuickSight) {
		//cehck for aws-quicksight-service-role-v0
		console.log('Gathering information on your QuickSight environment...');
		const iamClient = new IAMClient({region: input.region});

		const getRoleResponse = await iamClient.send(new GetRoleCommand({
			RoleName: 'aws-quicksight-service-role-v0',
		}));
		if (getRoleResponse.Role == undefined) {
			console.log('Unable to verify that QuickSight has been enabled in this account. Please follow the guide here https://docs.aws.amazon.com/quicksight/latest/user/getting-started.html');
			process.exit(-1);
		}
		const usersAndGroups = await getQuickSightUsersAndGroups(input)
		users.push(...usersAndGroups.users)
		groups.push(...usersAndGroups.groups)
	}
	const quicksightUsersAndGroupsPrompts = [];
	if (quicksightConfirmation.deployQuickSight && (users.length > 0 || groups.length > 0)) {
		if (users.length > 0) {
			quicksightUsersAndGroupsPrompts.push({
				type: 'multiselect',
				message: 'Select the QuickSight users you want to allow access to the Tag Inventory QuickSight resources',
				name: 'quickSightUsers',
				choices: users.filter(user => {
					return user.Active == true;
				}).map(user => {
					return {title: `${user.UserName} - ${user.Email}`, value: user.Arn};
				}),
				min: groups.length == 0 ? 1 : undefined,

			});
		}
		if (groups.length > 0) {
			quicksightUsersAndGroupsPrompts.push({
				type: 'multiselect',
				message: 'Select the QuickSight groups you want to allow access to the Tag Inventory QuickSight resources',
				name: 'quickSightGroups',
				choices: groups.map(group => {
					return {title: `${group.GroupName} - ${group.Description}`, value: group.Arn};
				}),
				min: users.length == 0 ? 1 : undefined,

			});
		}
	} else if (quicksightConfirmation.deployQuickSight) {
		console.log('Unable to retrieve any QuickSight users or groups. Please ensure you have setup at least one user https://docs.aws.amazon.com/quicksight/latest/user/managing-users.html');
		process.exit(-1);
	}
	const quicksightUsersAndGroups = await prompts(quicksightUsersAndGroupsPrompts);
	const overallConfirmation = await prompts([{
		type: 'confirm',
		name: 'confirm',
		message: `Are you sure you want to deploy the central stack to region ${input.region} in account ${account}?`,

	}]);
	if (overallConfirmation.confirm) {
		console.log('Deploying Central Stack');
		let cmd = 'npm run deploy -- --require-approval never';
		if (profile != undefined) {
			cmd = cmd + ' --profile ' + profile;
		}
		cmd = cmd + ' --region ' + input.region + ' -c stack=central -c organizationId=' + organization.Id + ' -c organizationPayerAccountId=' + organization.MasterAccountId + ' -c deployQuickSight=' + quicksightConfirmation.deployQuickSight + ' -c schedule=' + input.schedule;
		if (quicksightUsersAndGroups.quickSightUsers != undefined) {
			cmd = cmd + ' -c quickSightUserArns=' + quicksightUsersAndGroups.quickSightUsers.join(',');
		}
		if (quicksightUsersAndGroups.quickSightGroups != undefined) {
			cmd = cmd + ' -c quickSightGroupArns=' + quicksightUsersAndGroups.quickSightGroups?.join(',');
		}
		cmd=cmd+" --parameters OrganizationIdParameter="+organization.Id+" --parameters ScheduleParameter="+input.schedule+" --parameters OrganizationPayerAccountIdParameter="+ organization.MasterAccountId
		execSync(cmd, {stdio: 'inherit', env: {...process.env, "AWS_DEFAULT_REGION": input.region}})

	} else {
		console.log('Goodbye');
		process.exit(0);
	}

}


async function spokeStack(input: { account: string, stack: string; region: string, schedule: string }): Promise<void> {
	console.info('Gathering info on your AWS organization...');

	const organizationClient = new OrganizationsClient({region: input.region});
	const organization = await getOrganization(input.region, organizationClient);
	const account = input.account

	const allRegions = await getAllRegions();
	const answer = await prompts([{
		type: 'text',
		message: 'Enter the name of the bucket in the central account where tag inventory data will be written to: ',
		name: 'bucketName',
	},{
		type: 'text',
		message: 'Enter the arn of the central account notification topic: ',
		name: 'topicArn',
	}, {
		type: 'text',
		message: 'Enter the arn of the central cross-account role: ',
		name: 'centralRoleArn',
	}, {
		type: 'multiselect',
		message: 'Select the regions in this account to gather tag inventory data from: ',
		name: 'enabledRegions',
		choices: allRegions.map(region => {
			return {title: region, value: region};
		}),
	}, {
		type: 'select',
		message: 'Select the region to deploy AWS Resource Explorer aggregator index: ',
		name: 'aggregatorRegion',
		choices: allRegions.map(region => {
			return {title: region, value: region};
		}),
	}, {
		type: 'confirm',
		name: 'confirm',
		message: `Are you sure you want to deploy the spoke stack to region ${input.region} in account ${account}?`,

	}]);
	if (answer.confirm) {
		console.log('Deploying Spoke Stack');
		let cmd = 'npm run deploy -- --require-approval never';
		if (profile != undefined) {
			cmd = cmd + ' --profile ' + profile;
		}
		cmd = cmd + ' --region ' + input.region + ' -c stack=spoke -c enabledRegions=' + answer.enabledRegions.join(',') + ' -c aggregatorRegion=' + answer.aggregatorRegion + ' -c bucketName=' + answer.bucketName +' -c topicArn=' + answer.topicArn +  ' -c centralRoleArn=' + answer.centralRoleArn + ' -c organizationPayerAccountId=' + organization.MasterAccountId + ' -c schedule=' + input.schedule;
		cmd = cmd+ " --parameters BucketNameParameter="+ answer.bucketName+ " --parameters TopicArnParameter="+ answer.topicArn+" --parameters CentralRoleArnParameter="+ answer.centralRoleArn+" --parameters EnabledRegionsParameter="+answer.enabledRegions.join(',')+" --parameters AggregatorRegionParameter="+ answer.aggregatorRegion+" --parameters OrganizationPayerAccountIdParameter="+organization.MasterAccountId+" --parameters ScheduleParameter="+input.schedule
		execSync(cmd, {env: {...process.env, "AWS_DEFAULT_REGION": input.region}, stdio: 'inherit'});


	} else {
		console.log('Goodbye');
		process.exit(0);
	}


}

async function organizationStack(input: { account: string, stack: string; region: string, schedule: string}): Promise<void> {
	try {
		console.info('Gathering info on your AWS organization...');
		const organizationClient = new OrganizationsClient({region: input.region});
		const organization = await getOrganization(input.region, organizationClient);
		const account = input.account
		if (organization.MasterAccountId != account) {
			console.error(`You can only choose 'Organization' with credentials for account #${organization.MasterAccountId} which is the payer account for your AWS organization`);
			process.exit(-1);
		}
		const roots = await organizationClient.send(new ListRootsCommand({}));
		if (roots.Roots == undefined || roots.Roots[0] == undefined || roots.Roots.length > 1) {
			throw new Error('Could not determine organizational root');
		}
		const allRegions = await getAllRegions();
		const allOus: OrganizationalUnit[] = await getAllOus(input.region, organizationClient, roots.Roots[0]);
		const answer = await prompts([{
			type: 'text',
			message: 'Enter the name of the bucket in the central account where tag inventory data will be written to: ',
			name: 'bucketName',
			validate: (value: string) => value == undefined || value.trim().length == 0 ? 'Bucket name required' : true,
		},{
			type: 'text',
			message: 'Enter the arn of the central account notification topic: ',
			name: 'topicArn',
		}, {
			type: 'text',
			message: 'Enter the arn of the central cross-account role: ',
			name: 'centralRoleArn',
			validate: (value: string) => value == undefined || value.trim().length == 0 ? 'Role arn required' : true,
		}, {
			type: 'multiselect',
			message: 'Select the regions in this account to gather tag inventory data from: ',
			name: 'enabledRegions',
			choices: allRegions.map(region => {
				return {title: region, value: region};
			}),
			min: 1,

		}, {
			type: 'select',
			message: 'Select the region to deploy AWS Resource Explorer aggregator index: ',
			name: 'aggregatorRegion',
			choices: allRegions.map(region => {
				return {title: region, value: region};
			}),

		}, {
			type: 'multiselect',
			message: 'Select the organizational units to deploy the spoke stacks to: ',
			name: 'organizationalUnitIds',
			choices: allOus.map(ou => {
				return {title: `${ou.Name} - ${ou.Id}`, value: ou.Id};
			}),
			min: 1,
		}, {
			type: 'confirm',
			name: 'confirm',
			message: 'Are you sure you want to deploy the spoke stack to the selected OU(s)?',

		}]);
		if (answer.confirm) {
			console.log('Deploying Spoke Stacks to Organization');
			let cmd = 'npm run deploy -- --require-approval never';
			if (profile != undefined) {
				cmd = cmd + ' --profile ' + profile;
			}
			cmd = cmd + ' --region ' + input.region + ' -c stack=organization -c organizationId=' + organization.Id + ' -c enabledRegions=' + answer.enabledRegions.join(',') + ' -c aggregatorRegion=' + answer.aggregatorRegion + ' -c bucketName=' + answer.bucketName+' -c topicArn=' + answer.topicArn  + ' -c centralRoleArn=' + answer.centralRoleArn + ' -c organizationalUnitIds=' + answer.organizationalUnitIds.join(',') + ' -c organizationPayerAccountId=' + organization.MasterAccountId + ' -c schedule=' + input.schedule ;
			cmd = cmd+ " --parameters BucketNameParameter="+ answer.bucketName+ " --parameters TopicArnParameter="+ answer.topicArn+" --parameters CentralRoleArnParameter="+ answer.centralRoleArn+" --parameters EnabledRegionsParameter="+answer.enabledRegions.join(',')+" --parameters AggregatorRegionParameter="+ answer.aggregatorRegion+" --parameters OrganizationPayerAccountIdParameter="+organization.MasterAccountId+" --parameters ScheduleParameter="+input.schedule+" --parameters OrganizationalUnitIdsParameter="+answer.organizationalUnitIds.join(',')+ ' --all'
			execSync(cmd, {env: {...process.env, "AWS_DEFAULT_REGION": input.region}, stdio: 'inherit'})

		} else {
			console.log('Goodbye');
			process.exit(0);
		}
	} catch (e) {
		const error = e as Error;
		if (error.name == 'AccessDeniedException') {
			console.error("You can only choose 'Organization' with credentials for the payer account for your AWS organization");
			process.exit(-1);
		} else {
			throw error;
		}
	}

}


(async () => {

	const stackResponse = await chooseStack();
	if (stackResponse.stack == 'central') {
		await centralStack(stackResponse);
	} else if (stackResponse.stack == 'spoke') {
		await spokeStack(stackResponse);
	} else if (stackResponse.stack == 'organization') {
		await organizationStack(stackResponse);
	}

})();


