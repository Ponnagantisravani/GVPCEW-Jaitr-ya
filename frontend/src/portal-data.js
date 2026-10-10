export async function settlePortalRequests(requests) {
 const results=await Promise.allSettled(requests);
 return {failed:results.some(r=>r.status==='rejected'),responses:results.map(r=>r.status==='fulfilled'?r.value:{data:{}})};
}
