import * as fs from 'fs';
import * as path from 'path';
import { Link, Node } from '@npmcli/arborist';
import { awscdk } from 'projen';
import { AwsCdkTypeScriptApp } from 'projen/lib/awscdk';
import { NodePackageManager, NodeProject } from 'projen/lib/javascript';


const Arborist = require('@npmcli/arborist');

const app = async (): Promise<AwsCdkTypeScriptApp> => {
  const project = new awscdk.AwsCdkTypeScriptApp({
    cdkVersion: '2.82.0',
    defaultReleaseBranch: 'main',
    name: 'aws-organizations-tag-inventory',
    projenrcTs: true,
    packageManager: NodePackageManager.NPM,
    gitignore: ['.idea', '*.iml', '.DS_Store', 'repolinter.txt', '.$architecture.drawio.bkp', '*.output.txt','QuestionsQuicksightShouldAnswer.md','definition.json'],
    license: 'MIT-0',
    github: false,

    copyrightOwner: 'Amazon.com, Inc. or its affiliates. All Rights Reserved.',
    deps: ['@types/aws-lambda', '@aws-sdk/client-resource-explorer-2', 'uuid', '@aws-sdk/client-athena', '@aws-sdk/client-s3', '@aws-lambda-powertools/logger', 'cdk-nag'], /* Runtime dependencies of this module. */
    // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
    devDeps: ['@types/uuid', '@npmcli/arborist', '@types/npm-packlist', '@types/npmcli__arborist', 'cdk-assets','@aws-sdk/client-organizations','prompts','@types/prompts','@aws-sdk/client-ec2','@smithy/shared-ini-file-loader','@aws-sdk/credential-providers','@aws-sdk/client-sts','@aws-sdk/client-iam','@aws-sdk/client-quicksight'], /* Build dependencies for this module. */
    // packageName: undefined,  /* The "name" in package.json. */

  });
  await addZipLayerTask(project, ['@aws-lambda-powertools', 'aws-cdk-lib', 'constructs', '@types']);

  /**
	 * This function walks the package.json for the project and zips all production dependencies for use in a lambda layer
	 * @param p
	 * @param exclude
	 */
  async function addZipLayerTask(p: NodeProject, exclude: string[] = []) {
    const steps = [
      {
        exec: 'rm -Rf ./dist',
      },
      {
        exec: `rm -Rf /tmp/${p.name}`,
      },
      {
        exec: `mkdir -p /tmp/${p.name}/nodejs/node_modules/${p.package.packageName}`,
      },

    ];


    const a = new Arborist({ path: p.outdir });
    const depNames: string[] = [];
    const excludeDeps = (depName: string) => {
      for (const ex of exclude) {
        if (depName.startsWith(ex)) {
          return true;
        }
      }
      return false;
    };
    const recursivelyGetDependencies = (node: Node | Link) => {
      if (node.package.dependencies != undefined) {
        for (const depName of Object.keys(node.package.dependencies)) {
          if (depNames.indexOf(depName) == -1) {
            let d = node.children.get(depName);
            if (d == undefined) {
              d = node.root.inventory.get(`node_modules/${depName}`);
            }
            if (d != undefined && !d.dev && !excludeDeps(d.name)) {
              const relativePath = path.relative(p.outdir, d.path);
              if (fs.existsSync(relativePath)) {
                steps.push({
                  exec: `mkdir -p /tmp/${p.name}/nodejs/node_modules/${depName}`,
                });
                steps.push({
                  exec: `cp -R ${relativePath}/* /tmp/${p.name}/nodejs/node_modules/${depName}`,
                });

              }

              recursivelyGetDependencies(d);
            }
            depNames.push(depName);
          }
        }
      }
    };
    //@ts-ignore
    const tree = await a.loadActual();
    recursivelyGetDependencies(tree);


    steps.push({
      exec: `mkdir ./dist;(cd /tmp/${p.name} && zip -r /${p.outdir}/dist/${p.name}-layer.zip ./nodejs)`,
    });

    p.addTask('zip-layer', {
      cwd: p.outdir,
      steps: steps,
    });
    p.tasks.tryFind('compile')?.exec('npm run zip-layer');
  }

  return project;
};

app().then(project => {
  project.tasks.addTask("cli",{
    exec:"npx ts-node -P tsconfig.json --prefer-ts-exts src/cli.ts"
  })
  project.tasks.tryFind('post-compile')?.reset();
  project.tasks.tryFind('synth')?.reset('cdk synth', {
    receiveArgs: true,
  });
  project.tasks.tryFind('synth:silent')?.reset('cdk synth -q', {
    receiveArgs: true,
  });
  project.tasks.tryFind('deploy')?.prependExec('cdk synth', {
    receiveArgs: true,
  });
  project.synth();
}).catch(reason => {
  throw new Error(reason);
});

