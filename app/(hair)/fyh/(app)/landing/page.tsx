import { redirect } from 'next/navigation';
import { requireHairAuthPage, resolveDefaultLandingPath } from '@/src/hair/lib/auth/guards';

export default async function LandingPage() {
  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'46caee'},body:JSON.stringify({sessionId:'46caee',runId:'post-fix',hypothesisId:'B',location:'landing/page.tsx',message:'landing dispatcher entered',data:{},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const admin = await requireHairAuthPage();
  redirect(resolveDefaultLandingPath(admin));
}
