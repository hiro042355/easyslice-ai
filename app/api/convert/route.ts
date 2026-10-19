import {requireAuthenticatedRequest} from '@/lib/server/productionIdentity/routeGuard';
import {createMediaConvertRoute} from '@/lib/server/mediaConvertCore';
import {resolvePackagedFfmpeg} from '@/lib/server/packagedFfmpeg';
import {LOCAL_MEDIA_INPUT_OPTIONS,runMediaProcess} from '@/lib/server/requestMediaWorkspace';

export const runtime='nodejs';
export const POST=createMediaConvertRoute({authenticate:requireAuthenticatedRequest,convert:async(source,destination,signal)=>{
 await runMediaProcess(resolvePackagedFfmpeg(),['-nostdin','-y',...LOCAL_MEDIA_INPUT_OPTIONS,'-i',source,'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',destination],signal,180000);
}});
