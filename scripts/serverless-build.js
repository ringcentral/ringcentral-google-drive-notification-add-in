const { rm, echo, cp } = require('shelljs');
const { resolve } = require('path');

const projectPath = resolve(__dirname, '..');
const deployPath = resolve(projectPath, 'serverless-deploy')

echo('clean path...');
rm('-rf', `${deployPath}/*.js`);
rm('-rf', `${deployPath}/*.json`);
rm('-rf', `${deployPath}/server`);
rm('-rf', `${deployPath}/node_modules`);
echo('building...');
cp('-r', `${projectPath}/src/server`, `${deployPath}/server`);
cp(`${projectPath}/src/server.js`, `${deployPath}/server.js`);
cp(`${projectPath}/src/lambda.js`, `${deployPath}/lambda.js`);
cp(`${projectPath}/src/refreshGoogleSubCron.js`, `${deployPath}/refreshGoogleSubCron.js`);
cp(`${projectPath}/src/triggerDigestCron.js`, `${deployPath}/triggerDigestCron.js`);
cp(`${projectPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);

echo('build done');
