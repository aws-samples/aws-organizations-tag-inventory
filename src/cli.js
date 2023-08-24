"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
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
var client_ec2_1 = require("@aws-sdk/client-ec2");
var credential_providers_1 = require("@aws-sdk/credential-providers");
var client_sts_1 = require("@aws-sdk/client-sts");
var client_organizations_1 = require("@aws-sdk/client-organizations");
var exec = require("child_process").exec;
var sharedIniFileLoader = require('@aws-sdk/shared-ini-file-loader');
var prompts = require('prompts');
var allRegions = [];
var profile = undefined;
function chooseProfile() {
    return __awaiter(this, void 0, void 0, function () {
        var profiles, choices;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(profile == undefined)) return [3 /*break*/, 3];
                    return [4 /*yield*/, sharedIniFileLoader.loadSharedConfigFiles()];
                case 1:
                    profiles = _a.sent();
                    choices = Object.keys(profiles.credentialsFile).map(function (profileName) {
                        return { title: profileName, value: profileName };
                    });
                    return [4 /*yield*/, prompts({
                            type: 'select',
                            name: 'profile',
                            message: "Please choose a profile to use",
                            choices: choices
                        })];
                case 2:
                    profile = (_a.sent()).profile;
                    _a.label = 3;
                case 3: return [2 /*return*/, profile];
            }
        });
    });
}
function getAllRegions(profile) {
    if (profile === void 0) { profile = undefined; }
    return __awaiter(this, void 0, void 0, function () {
        var ec2Client, describeRegionsResponse, e_1, error, listProfiles, profile_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(allRegions.length == 0)) return [3 /*break*/, 12];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 11]);
                    ec2Client = new client_ec2_1.EC2Client({
                        region: 'us-east-1',
                        credentials: profile != undefined ? (0, credential_providers_1.fromIni)({
                            profile: profile
                        }) : undefined
                    });
                    return [4 /*yield*/, ec2Client.send(new client_ec2_1.DescribeRegionsCommand({
                            AllRegions: true
                        }))];
                case 2:
                    describeRegionsResponse = _a.sent();
                    describeRegionsResponse.Regions.forEach(function (region) {
                        allRegions.push(region.RegionName);
                    });
                    return [2 /*return*/, allRegions];
                case 3:
                    e_1 = _a.sent();
                    error = e_1;
                    if (!(error.name == "CredentialsProviderError")) return [3 /*break*/, 9];
                    return [4 /*yield*/, prompts({
                            type: 'select',
                            name: 'shouldListProfiles',
                            message: "Could not load credentials from any providers. Would you like to specify an AWS profile to use?",
                            choices: [
                                { title: "Yes", value: true },
                                { title: "No", value: false }
                            ]
                        })];
                case 4:
                    listProfiles = _a.sent();
                    if (!(listProfiles.shouldListProfiles == true)) return [3 /*break*/, 7];
                    return [4 /*yield*/, chooseProfile()];
                case 5:
                    profile_1 = _a.sent();
                    return [4 /*yield*/, getAllRegions(profile_1)];
                case 6: return [2 /*return*/, _a.sent()];
                case 7:
                    console.error("Unable to list AWS profiles. Be sure to setup at least one profile by running `aws configure`");
                    process.exit(-1);
                    _a.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    if (error.name == "AuthFailure") {
                        console.error("Unable to validate the provided access credentials");
                        process.exit(-1);
                    }
                    else if (error.name == "RequestExpired") {
                        console.error("Credentials have expired");
                        process.exit(-1);
                    }
                    else {
                        throw error;
                    }
                    _a.label = 10;
                case 10: return [3 /*break*/, 11];
                case 11: return [3 /*break*/, 13];
                case 12: return [2 /*return*/, allRegions];
                case 13: return [2 /*return*/];
            }
        });
    });
}
function chooseStack() {
    return __awaiter(this, void 0, void 0, function () {
        var allRegions;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getAllRegions()];
                case 1:
                    allRegions = _a.sent();
                    return [4 /*yield*/, prompts([{
                                type: 'select',
                                name: 'stack',
                                message: 'Which stack would you like to deploy',
                                choices: [
                                    { title: 'Central', description: 'This stack deploys the centralized bucket where all tag data will be written to and the bucket where the inventory reports will be generated. This stack should be deployed first and only be deployed once', value: 'central' },
                                    { title: 'Spoke', description: 'The stack deploy the spoke stack in the current account. It will setup a set of AWS Resource Explorer indexes and an AWS Step Function State Machine that will periodically run to gather tag inventory data and send it to the central account', value: 'spoke' },
                                    { title: 'Organization', description: "This will deploy the spoke stack to multiple accounts within your AWS Organization. Must be run from the organization payer account.", value: "organization" }
                                ],
                            }, {
                                type: 'select',
                                name: 'region',
                                message: 'What region do you want to deploy to?',
                                choices: allRegions.map(function (region) {
                                    return { title: region, value: region };
                                })
                            }])];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function getCurrentAccount(region) {
    return __awaiter(this, void 0, void 0, function () {
        var client, getCallerIdentityResponse;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    client = new client_sts_1.STSClient({ region: region });
                    return [4 /*yield*/, client.send(new client_sts_1.GetCallerIdentityCommand({}))];
                case 1:
                    getCallerIdentityResponse = _a.sent();
                    return [2 /*return*/, getCallerIdentityResponse.Account];
            }
        });
    });
}
function getOrganizationId(region, client) {
    if (client === void 0) { client = new client_organizations_1.OrganizationsClient({ region: region }); }
    return __awaiter(this, void 0, void 0, function () {
        var describeOrganizationCommandOutput;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, client.send(new client_organizations_1.DescribeOrganizationCommand({}))];
                case 1:
                    describeOrganizationCommandOutput = _a.sent();
                    if (describeOrganizationCommandOutput.Organization == undefined) {
                        throw new Error("This solution is meant to be used with AWS Organizations. Please create an AWS organization first.");
                    }
                    else {
                        return [2 /*return*/, describeOrganizationCommandOutput.Organization.Id];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function getAccountsForOrganization(region, client) {
    var _a, e_2, _b, _c;
    if (client === void 0) { client = new client_organizations_1.OrganizationsClient({ region: region }); }
    return __awaiter(this, void 0, void 0, function () {
        var accounts, paginatedAccounts, _d, paginatedAccounts_1, paginatedAccounts_1_1, page, _i, _e, account, e_2_1, e_3, error;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 13, , 14]);
                    accounts = [];
                    paginatedAccounts = (0, client_organizations_1.paginateListAccounts)({
                        client: client,
                        pageSize: 10,
                    }, {});
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 6, 7, 12]);
                    _d = true, paginatedAccounts_1 = __asyncValues(paginatedAccounts);
                    _f.label = 2;
                case 2: return [4 /*yield*/, paginatedAccounts_1.next()];
                case 3:
                    if (!(paginatedAccounts_1_1 = _f.sent(), _a = paginatedAccounts_1_1.done, !_a)) return [3 /*break*/, 5];
                    _c = paginatedAccounts_1_1.value;
                    _d = false;
                    page = _c;
                    if (page.Accounts != undefined) {
                        for (_i = 0, _e = page.Accounts; _i < _e.length; _i++) {
                            account = _e[_i];
                            if (account.Status == "ACTIVE") {
                                accounts.push(account);
                            }
                        }
                    }
                    _f.label = 4;
                case 4:
                    _d = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_2_1 = _f.sent();
                    e_2 = { error: e_2_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _f.trys.push([7, , 10, 11]);
                    if (!(!_d && !_a && (_b = paginatedAccounts_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _b.call(paginatedAccounts_1)];
                case 8:
                    _f.sent();
                    _f.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_2) throw e_2.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12: return [2 /*return*/, accounts];
                case 13:
                    e_3 = _f.sent();
                    error = e_3;
                    if (error.name == "AccessDeniedException") {
                        console.error("AccessDenied. Are you running this from the organizational payer account?");
                        process.exit(-1);
                    }
                    else {
                        throw error;
                    }
                    return [3 /*break*/, 14];
                case 14: return [2 /*return*/];
            }
        });
    });
}
function centralStack(input) {
    return __awaiter(this, void 0, void 0, function () {
        var account, orgId, answer, cmd, child;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCurrentAccount(input.region)];
                case 1:
                    account = _a.sent();
                    return [4 /*yield*/, getOrganizationId(input.region)];
                case 2:
                    orgId = _a.sent();
                    return [4 /*yield*/, prompts({
                            type: "confirm",
                            name: "confirm",
                            message: "Are you sure you want to deploy the central stack to region ".concat(input.region, " in account ").concat(account, "?"),
                        })];
                case 3:
                    answer = _a.sent();
                    if (answer.confirm) {
                        console.log("Deploying Central Stack");
                        cmd = "npm run deploy -- --require-approval never";
                        if (profile != undefined) {
                            cmd = cmd + " --profile " + profile;
                        }
                        cmd = cmd + " --region " + input.region + " -c stack=central -c organizationId=" + orgId;
                        child = exec(cmd, function (error, stdout, stderr) {
                            if (error) {
                                console.log("error: ".concat(error.message));
                                return;
                            }
                            if (stderr) {
                                console.log("stderr: ".concat(stderr));
                                return;
                            }
                            console.log("stdout: ".concat(stdout));
                        });
                        child.stdout.on('data', function (data) {
                            console.log(data.toString());
                        });
                    }
                    else {
                        console.log("Goodbye");
                        process.exit(0);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function spokeStack(input) {
    return __awaiter(this, void 0, void 0, function () {
        var account, allRegions, answer, cmd, child;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCurrentAccount(input.region)];
                case 1:
                    account = _a.sent();
                    return [4 /*yield*/, getAllRegions()];
                case 2:
                    allRegions = _a.sent();
                    return [4 /*yield*/, prompts([{
                                type: "text",
                                message: "Enter the name of the bucket in the central account where tag inventory data will be written to: ",
                                name: "bucketName",
                            }, {
                                type: "text",
                                message: "Enter the arn of the central cross-account role: ",
                                name: "centralRoleArn",
                            }, {
                                type: "multiselect",
                                message: "Select the regions in this account to gather tag inventory data from: ",
                                name: "enabledRegions",
                                choices: allRegions.map(function (region) {
                                    return { title: region, value: region };
                                })
                            }, {
                                type: "select",
                                message: "Select the region to deploy AWS Resource Explorer aggregator index: ",
                                name: "aggregatorRegion",
                                choices: allRegions.map(function (region) {
                                    return { title: region, value: region };
                                })
                            }, {
                                type: "confirm",
                                name: "confirm",
                                message: "Are you sure you want to deploy the spoke stack to region ".concat(input.region, " in account ").concat(account, "?"),
                            }])];
                case 3:
                    answer = _a.sent();
                    if (answer.confirm) {
                        console.log("Deploying Spoke Stack");
                        cmd = "npm run deploy -- --require-approval never";
                        if (profile != undefined) {
                            cmd = cmd + " --profile " + profile;
                        }
                        cmd = cmd + " --region " + input.region + " -c stack=spoke -c enabledRegions=" + answer.enabledRegions.join(",") + " -c aggregatorRegion=" + answer.aggregatorRegion + " -c bucketName=" + answer.bucketName + " -c centralRoleArn=" + answer.centralRoleArn;
                        child = exec(cmd, function (error, stdout, stderr) {
                            if (error) {
                                console.log("error: ".concat(error.message));
                                return;
                            }
                            if (stderr) {
                                console.log("stderr: ".concat(stderr));
                                return;
                            }
                            console.log("stdout: ".concat(stdout));
                        });
                        child.stdout.on('data', function (data) {
                            console.log(data.toString());
                        });
                    }
                    else {
                        console.log("Goodbye");
                        process.exit(0);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function organizationStack(input) {
    return __awaiter(this, void 0, void 0, function () {
        var allRegions, allAccounts, answer, cmd, child;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getAllRegions()];
                case 1:
                    allRegions = _a.sent();
                    return [4 /*yield*/, getAccountsForOrganization(input.region)];
                case 2:
                    allAccounts = _a.sent();
                    return [4 /*yield*/, prompts([{
                                type: "text",
                                message: "Enter the name of the bucket in the central account where tag inventory data will be written to: ",
                                name: "bucketName",
                            }, {
                                type: "text",
                                message: "Enter the arn of the central cross-account role: ",
                                name: "centralRoleArn",
                            }, {
                                type: "multiselect",
                                message: "Select the regions in this account to gather tag inventory data from: ",
                                name: "enabledRegions",
                                choices: allRegions.map(function (region) {
                                    return { title: region, value: region };
                                })
                            }, {
                                type: "select",
                                message: "Select the region to deploy AWS Resource Explorer aggregator index: ",
                                name: "aggregatorRegion",
                                choices: allRegions.map(function (region) {
                                    return { title: region, value: region };
                                })
                            }, {
                                type: "multiselect",
                                message: "Select the accounts to deploy the spoke stacks to: ",
                                name: "spokeStackAccounts",
                                choices: allAccounts.map(function (account) {
                                    return { title: "".concat(account.Name, " - ").concat(account.Id), value: account.Id };
                                })
                            }, {
                                type: "confirm",
                                name: "confirm",
                                message: "Are you sure you want to deploy the spoke stack to the selected accounts?",
                            }])];
                case 3:
                    answer = _a.sent();
                    if (answer.confirm) {
                        console.log("Deploying Spoke Stacks to Organization");
                        cmd = "npm run deploy -- --require-approval never";
                        if (profile != undefined) {
                            cmd = cmd + " --profile " + profile;
                        }
                        cmd = cmd + " --region " + input.region + " -c stack=organization -c enabledRegions=" + answer.enabledRegions.join(",") + " -c aggregatorRegion=" + answer.aggregatorRegion + " -c bucketName=" + answer.bucketName + " -c centralRoleArn=" + answer.centralRoleArn + " -c spokeAccounts=" + answer.spokeStackAccounts.join(",");
                        child = exec(cmd, function (error, stdout, stderr) {
                            if (error) {
                                console.log("error: ".concat(error.message));
                                return;
                            }
                            if (stderr) {
                                console.log("stderr: ".concat(stderr));
                                return;
                            }
                            console.log("stdout: ".concat(stdout));
                        });
                        child.stdout.on('data', function (data) {
                            console.log(data.toString());
                        });
                    }
                    else {
                        console.log("Goodbye");
                        process.exit(0);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var stackResponse;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, chooseStack()];
            case 1:
                stackResponse = _a.sent();
                if (!(stackResponse.stack == "central")) return [3 /*break*/, 3];
                return [4 /*yield*/, centralStack(stackResponse)];
            case 2:
                _a.sent();
                return [3 /*break*/, 7];
            case 3:
                if (!(stackResponse.stack == "spoke")) return [3 /*break*/, 5];
                return [4 /*yield*/, spokeStack(stackResponse)];
            case 4:
                _a.sent();
                return [3 /*break*/, 7];
            case 5:
                if (!(stackResponse.stack == "organization")) return [3 /*break*/, 7];
                return [4 /*yield*/, organizationStack(stackResponse)];
            case 6:
                _a.sent();
                _a.label = 7;
            case 7: return [2 /*return*/];
        }
    });
}); })();
