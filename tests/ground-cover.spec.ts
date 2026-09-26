import { expect, test } from '@playwright/test';

test('each cover study retains its construction and objects share contact through navigation and removal', async ({ page }) => {
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?s=10');await expect(page.locator('#loading')).toBeHidden();
  const snapshot=()=>page.evaluate(()=>(window as any).__study.snapshot());
  const start=await snapshot();expect(start.cover.layers).toEqual([]);
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  await expect(page.locator('#study-caption')).toBeHidden();
  await page.getByLabel('Tall blades',{exact:true}).uncheck();
  await expect.poll(async()=>(await snapshot()).grass.layers.includes('blades')).toBe(false);
  await page.getByLabel('Ground weave',{exact:true}).uncheck();expect((await snapshot()).cover.foundation).toBe(false);
  await page.getByLabel('Ground weave',{exact:true}).check();
  await page.getByRole('button',{name:'Close layer controls'}).click();
  await page.getByRole('button',{name:'Next study',exact:true}).click();
  await expect(page).toHaveURL(/s=11/);await expect.poll(async()=>(await snapshot()).cover.layers).toEqual(['opaque']);
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  await page.getByLabel('Build the tuft with').selectOption('cards');expect((await snapshot()).cover.layers).toEqual(['cards']);
  await page.getByText('Objects can touch it too',{exact:true}).click();
  await page.getByRole('button',{name:'Place a stone',exact:true}).click();
  await page.keyboard.press('Escape');expect((await snapshot()).contacts.placing).toBe(false);
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  await page.getByRole('button',{name:'Place a stone',exact:true}).click();
  await page.mouse.click(400,510);
  await expect.poll(async()=>(await snapshot()).grass.contactObjects).toBe(1);
  const placed=await snapshot();expect(placed.contacts.objects).toHaveLength(1);
  await page.getByRole('button',{name:'Winds',exact:true}).click();await expect(page.locator('#cover-panel')).toBeHidden();
  await page.getByRole('button',{name:'Add vortex',exact:true}).click();
  const winds=(await snapshot()).grass.winds;
  await page.keyboard.press('Escape');await page.locator('#world').focus();await page.keyboard.press('l');
  await expect(page).toHaveURL(/s=12/);
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  await page.getByRole('slider',{name:'Layers',exact:true}).fill('20');
  await page.getByLabel('Separate the slices').fill('.6');
  expect((await snapshot()).cover.shellCount).toBe(20);expect((await snapshot()).cover.reveal).toBe(.6);
  await page.getByLabel('Fins at shallow angles').uncheck();expect((await snapshot()).cover.layers).toEqual(['shells']);
  await page.getByLabel('Fins at shallow angles').check();
  await page.getByRole('button',{name:'Close layer controls'}).click();
  await page.getByRole('button',{name:'Next study',exact:true}).click();await expect(page).toHaveURL(/s=13/);
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  await page.getByRole('slider',{name:'Sample limit'}).fill('36');await page.getByLabel('Show samples visited').check();
  expect((await snapshot()).cover.sampleCount).toBe(36);expect((await snapshot()).cover.layers).toEqual(['implicit']);
  await page.getByRole('button',{name:'Weather',exact:true}).click();await expect(page.locator('#cover-panel')).toBeHidden();
  await page.getByRole('slider',{name:'Day into night'}).fill('1');
  await expect.poll(async()=>(await snapshot()).weather.night).toBeGreaterThan(.9);
  await page.getByRole('slider',{name:'Rainfall'}).fill('1');
  await expect.poll(async()=>(await snapshot()).weather.wetness).toBeGreaterThan(.1);
  await page.keyboard.press('Escape');await page.locator('#world').focus();await page.keyboard.press('0');
  await expect(page.locator('#app')).toHaveAttribute('data-study','ground');
  await expect.poll(async()=>(await snapshot()).cover.coverage).toBe(1);
  const earlier=await snapshot();expect(earlier.cover.active).toBe(0);expect(earlier.cover.layers).toEqual([]);
  expect(earlier.grass.winds).toEqual(winds);expect(earlier.contacts.objects).toEqual(placed.contacts.objects);
  expect(earlier.position).toEqual(start.position);
  await page.keyboard.press('9');await expect(page).toHaveURL(/s=9/);await page.keyboard.press('l');await expect(page).toHaveURL(/s=10/);
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  expect((await snapshot()).cover.anchor).toBe(false);
  await page.getByRole('button',{name:'Remove stones',exact:true}).click();expect((await snapshot()).grass.contactObjects).toBe(0);
  expect((await snapshot()).contacts.objects).toEqual([]);
  await page.getByRole('button',{name:'Close layer controls'}).click();await expect(page.locator('#cover-toggle')).toBeFocused();
  expect(errors).toEqual([]);
});

test('contact source identity does not change the impulse, and removed objects recover without another tick owner', async ({page})=>{
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const values=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');const {GrassInteraction}=await import('/src/interaction.ts');
    const run=(kind:'character'|'brush'|'object',rate:number)=>{
      const f=new GrassInteraction(),source={id:'source',kind,position:new T.Vector3(-4,0,5),radius:1.3,strength:42};
      for(let i=0;i<rate;i++){f.apply(source,1/rate);f.update(1/rate);}
      const held=f.energy,bytes=Array.from(f.texture.image.data);
      for(let i=0;i<rate*5;i++)f.update(1/rate);
      return {held,recovered:f.energy,bytes};
    };
    return [run('character',60),run('brush',60),run('object',60),run('object',144)];
  });
  expect(values[0].bytes).toEqual(values[1].bytes);expect(values[0].bytes).toEqual(values[2].bytes);
  for(const v of values){expect(v.held).toBeGreaterThan(1);expect(v.recovered).toBeLessThan(.02);}
  expect(Math.abs(values[2].held-values[3].held)/values[2].held).toBeLessThan(.1);
});

test('raised representations draw real coverage, respond to a contact source and preserve opaque canvas samples', async({page},info)=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const results=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {GrassField}=await import('/src/field.ts');const {GroundCover}=await import('/src/ground-cover.ts');const {createTerrain,heightAt}=await import('/src/terrain.ts');
    const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(384,288);renderer.toneMapping=T.NoToneMapping;renderer.setClearColor(0,1);
    const target=new T.WebGLRenderTarget(384,288,{samples:4});
    const field=new GrassField(),terrain=createTerrain(),cover=new GroundCover(field,terrain);
    const scene=new T.Scene();scene.background=new T.Color(0);scene.add(terrain,cover.root);
    const sun=new T.DirectionalLight(0xffffff,2);sun.position.set(-6,12,5);scene.add(sun,new T.HemisphereLight(0xffffff,0x555555,1));
    const camera=new T.PerspectiveCamera(48,384/288,.1,120);camera.position.set(-5,heightAt(-5,9)+1.6,9);camera.lookAt(-5,heightAt(-5,5)+.1,5);camera.updateMatrixWorld();
    field.setMode(12);field.windPatches.setEnabled(false);field.update(0,new T.Vector3(1000,0,0),null);
    cover.anchor=false;cover.setMode(10);cover.update(camera,900,0,.3,null);
    const draw=()=>{
      renderer.setRenderTarget(null);renderer.setRenderTarget(target);renderer.render(scene,camera);
      const pixels=new Uint8Array(384*288*4);renderer.readRenderTargetPixels(target,0,0,384,288,pixels);return pixels;
    };
    const diff=(a:Uint8Array,b:Uint8Array)=>{let total=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++)total+=Math.abs(a[i+j]-b[i+j]);return total/(384*288*3);};
    cover.foundation=false;cover.sync();const bare=draw();cover.foundation=true;cover.sync();const woven=draw();
    const foundationDifference=diff(bare,woven),reports=[];
    for(const [mode,kind] of [[11,'opaque'],[11,'cards'],[12,'shells'],[13,'implicit']] as const){
      cover.setMode(mode);cover.tuftKind=kind==='cards'?'cards':'opaque';cover.sync();cover.update(camera,900,0,.3,null);
      const before=draw();const triangles=renderer.info.render.triangles,calls=renderer.info.render.calls;
      let alphaLeaks=0;for(let i=3;i<before.length;i+=4)if(before[i]!==255)alphaLeaks++;
      cover.uniforms.turfMaskView.value=1;const mask=draw();cover.uniforms.turfMaskView.value=0;
      let covered=0;for(let i=0;i<mask.length;i+=4)if(mask[i]>32)covered++;
      const source={id:'stone',kind:'object' as const,position:new T.Vector3(-5,heightAt(-5,6),6),radius:2,strength:65};
      for(let i=0;i<60;i++){field.interaction.apply(source,1/60);field.interaction.update(1/60);}
      const contact=draw();
      for(let i=0;i<300;i++)field.interaction.update(1/60);
      const recovered=draw();
      cover.setCoverage(0);const hidden=draw();cover.uniforms.turfMaskView.value=1;const hiddenMask=draw();cover.uniforms.turfMaskView.value=0;cover.setCoverage(1);
      let hiddenPixels=0;for(let i=0;i<hiddenMask.length;i+=4)if(hiddenMask[i]>32)hiddenPixels++;
      reports.push({mode,kind,covered:covered/(384*288),alphaLeaks,contactDifference:diff(before,contact),recoveryDifference:diff(before,recovered),hiddenDifference:diff(before,hidden),hiddenPixels,triangles,calls});
    }
    cover.setMode(12);cover.shellCount=4;cover.sync();const fewLayers=draw(),fewTriangles=renderer.info.render.triangles;
    cover.shellCount=20;cover.reveal=.7;cover.sync();const separated=draw(),manyTriangles=renderer.info.render.triangles;
    const revealDifference=diff(fewLayers,separated);cover.reveal=0;
    cover.setMode(13);cover.sampleView=false;cover.sync();const natural=draw();cover.sampleView=true;cover.sync();const costView=draw();
    const costViewDifference=diff(natural,costView);cover.sampleView=false;cover.sync();
    // A physical object intersects the volume. Depth must not depend on whether
    // its draw is submitted before or after the implicit surface.
    cover.setMode(13);cover.sync();cover.update(camera,900,0,.3,null);
    const stone=new T.Mesh(new T.BoxGeometry(.6,.6,.6),new T.MeshBasicMaterial({color:0xff00ff}));
    stone.position.set(-5,heightAt(-5,6)+.3,6);scene.add(stone);
    stone.renderOrder=-1;const first=draw();stone.renderOrder=10;const last=draw();
    let visibleObject=0;for(let i=0;i<last.length;i+=4)if(last[i]>220&&last[i+1]<20&&last[i+2]>220)visibleObject++;
    const orderDifference=diff(first,last);
    // Finite camera routes exercise seams and shallow views while the field is frozen.
    scene.remove(stone);const route=[];
    for(const height of [.6,2,7]){
      camera.position.set(-5,heightAt(-5,9)+height,9);camera.lookAt(-5,heightAt(-5,5),5);camera.updateMatrixWorld();
      for(const mode of [11,12,13]){
        cover.setMode(mode);cover.sync();cover.update(camera,900,0,.3,null);cover.uniforms.turfMaskView.value=1;
        const a=draw();camera.position.x+=.01;camera.updateMatrixWorld();cover.update(camera,900,0,.3,null);const b=draw();
        camera.position.x-=.01;camera.updateMatrixWorld();cover.uniforms.turfMaskView.value=0;
        let coverage=0,movedCoverage=0;
        for(let i=0;i<a.length;i+=4){if(a[i]>32)coverage++;if(b[i]>32)movedCoverage++;}
        route.push({height,mode,coverage:coverage/(384*288),coverageChange:Math.abs(coverage-movedCoverage)/(384*288),movementDifference:diff(a,b)});
      }
    }
    target.dispose();renderer.dispose();
    return {foundationDifference,reports,visibleObject,orderDifference,route,revealDifference,costViewDifference,fewTriangles,manyTriangles};
  });
  await info.attach('cover-render-measurements',{body:JSON.stringify(results,null,2),contentType:'application/json'});
  expect(results.foundationDifference).toBeGreaterThan(2);
  expect(results.revealDifference).toBeGreaterThan(5);
  expect(results.costViewDifference).toBeGreaterThan(5);
  expect(results.manyTriangles).toBeGreaterThan(results.fewTriangles);
  expect(results.visibleObject).toBeGreaterThan(100);
  expect(results.orderDifference).toBeLessThan(.01);
  for(const view of results.route){
    expect(view.coverage,JSON.stringify(view)).toBeGreaterThan(.025);
    // Nearby edges legitimately move across many pixels. Check retained area,
    // not raw frame similarity, which would incorrectly reward a blurred image.
    expect(view.coverageChange,JSON.stringify(view)).toBeLessThan(.015);
  }
  for(const result of results.reports){
    expect(result.covered,result.kind).toBeGreaterThan(.08);
    expect(result.alphaLeaks,result.kind).toBe(0);
    expect(result.contactDifference,result.kind).toBeGreaterThan(.1);
    expect(result.recoveryDifference,result.kind).toBeLessThan(.1);
    expect(result.hiddenPixels,result.kind).toBe(0);
    expect(result.hiddenDifference,result.kind).toBeGreaterThan(2);
  }
  expect(errors).toEqual([]);
});
