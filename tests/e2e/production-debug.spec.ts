import {test,expect,createGameContext} from './fixtures';
import {createGameServer} from '../../apps/server/src/index';
import {createOnlineSession} from '@fender/net-client';
import {districtMap} from '@fender/content';
import {STORYLINES} from '@fender/contracts';
import {disposeTestRooms} from '../support/rooms';
const port=Number(process.env.FENDER_E2E_SERVER_PORT??2867)+301,origin=`http://127.0.0.1:${port}`;
let server:Awaited<ReturnType<typeof createGameServer>>,normal:ReturnType<typeof createOnlineSession>;
test.beforeAll(async()=>{server=await createGameServer(port,'127.0.0.1',{campaignId:STORYLINES[0]!.id});});
test.afterAll(async()=>{await normal?.dispose();await disposeTestRooms();await server?.gracefullyShutdown(false);});
test('the actual production bundle opens snow in a fresh room and keeps the original chase intact',async({page,browser},info)=>{
 normal=createOnlineSession(origin,districtMap);const oldRoom=crypto.randomUUID();await normal.connect({roomId:oldRoom,nickname:'Keep this case'});const before=structuredClone(normal.getSnapshot()!.campaign);
 await page.goto(`${origin}/?room=${oldRoom}&debugDispatch=9&debugCase=${STORYLINES[2]!.id}`);expect(await page.evaluate(()=>typeof (window as any).__FENDER_DEBUG__)).toBe('undefined');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await expect(page.locator('[data-tutorial-lesson]')).toContainText('SNOW DISPATCH');
 const room=new URL(page.url()).searchParams.get('room');expect(room).not.toBe(oldRoom);await expect(page).not.toHaveURL(/debugDispatch|debugCase/);expect(normal.getSnapshot()!.campaign).toEqual(before);
 await page.reload();await page.getByRole('button',{name:'HIT THE STREETS'}).click();await expect(page.locator('[data-tutorial-lesson]')).toContainText('SNOW DISPATCH');expect(new URL(page.url()).searchParams.get('room')).toBe(room);
 const context=await createGameContext(browser);try{const backup=await context.newPage();await backup.goto(page.url());await backup.getByRole('button',{name:'HIT THE STREETS'}).click();await expect(backup.locator('[data-tutorial-lesson]')).toContainText('SNOW DISPATCH');await page.getByRole('button',{name:'START DISPATCH'}).click();await expect(page.locator('[data-tutorial-controls]')).toContainText('SNOW + ICE');await page.screenshot({path:info.outputPath('production-snow.png')});expect((await page.request.post(`${origin}/debug/dispatch/${room}`,{data:{dispatch:3}})).status()).toBe(404);}finally{await context.close();}
});
