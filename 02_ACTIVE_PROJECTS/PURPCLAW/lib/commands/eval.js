'use strict';
async function run(args=[]){
  const dataset=args.find(arg=>!arg.startsWith('--'));if(!dataset)throw new Error('usage: purpclaw eval <dataset.json> [--threshold 0.8]');
  const at=args.indexOf('--threshold'),threshold=at>=0?Number(args[at+1]):1;
  const {AgentGateway}=require('../agent-gateway'),gateway=new AgentGateway({cwd:process.cwd()});
  const result=await gateway.dispatch('eval.run',{dataset,cwd:process.cwd(),threshold,permission_profile:'autonomous'});
  console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;return result;
}
module.exports={run};
