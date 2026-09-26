import { expect, test } from '@playwright/test';

test('rain wets the field, clears gradually, carries dusk and survives study and control round trips', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?s=9');await expect(page.locator('#loading')).toBeHidden();
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot());
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'rain');
  const start = await snapshot();
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.locator('#study-caption')).toBeHidden();
  await expect(page.locator('#weather-panel')).toBeVisible();
  await expect.poll(async () => (await snapshot()).weather.wetness).toBeGreaterThan(.2);
  const wet = await snapshot();
  expect(wet.weather.groundMaterial).toBe('MeshPhysicalMaterial');
  expect(wet.weather.groundClearcoat).toBeGreaterThan(.1);
  expect(wet.weather.rainInstances).toBe(16000);
  expect(wet.position).toEqual(start.position);
  expect(wet.grass.windPatches.passes).toBeGreaterThan(0);
  await page.screenshot({ path: 'state/rain-day.png' });
  const night = page.getByRole('slider', { name: 'Day into night' });
  await night.fill('1');
  const transitioning = (await snapshot()).weather;
  expect(transitioning.evening).toBe(1);expect(transitioning.night).toBeLessThan(.99);
  // Native controls retain number keys; they must not change studies.
  await night.focus();await page.keyboard.press('8');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'rain');
  await expect.poll(async () => (await snapshot()).weather.night).toBeGreaterThan(.95);
  const dark = await snapshot();expect(dark.weather.sunIntensity).toBeLessThan(wet.weather.sunIntensity*.25);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('#rain-stop')).toHaveCSS('background-color', 'rgb(35, 56, 45)');
  await page.screenshot({ path: 'state/rain-night.png' });
  await page.getByRole('button', { name: 'Stop rain', exact: true }).click();
  expect((await snapshot()).weather.wetness).toBeGreaterThan(.15);
  await expect.poll(async () => (await snapshot()).weather.rain).toBeLessThan(.005);
  const drying = await snapshot();
  await expect.poll(async () => (await snapshot()).weather.wetness).toBeLessThan(drying.weather.wetness-.025);
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  await expect(page.locator('#weather-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Add vortex', exact: true }).click();
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.locator('#wind-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.locator('#weather-panel')).toBeHidden();
  await page.keyboard.press('Escape');await page.locator('#world').focus();
  const contact = (await snapshot()).grass.contactEnergy;
  await page.mouse.move(820,550);await page.mouse.down({button:'left'});
  await expect.poll(async () => (await snapshot()).grass.contactEnergy).toBeGreaterThan(contact+1);
  await page.mouse.up({button:'left'});
  const beforeExit = await snapshot();
  await page.keyboard.press('8');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'wind-vectors');
  const leaving = (await snapshot()).weather;
  expect(leaving.blend).toBeGreaterThan(0);
  expect(leaving.groundMaterial).toBe('MeshPhysicalMaterial');
  await expect.poll(async () => (await snapshot()).weather.blend).toBe(0);
  const earlier = await snapshot();
  expect(earlier.weather.groundMaterial).toBe('MeshStandardMaterial');
  expect(earlier.weather.rainVisible).toBe(false);
  expect(earlier.weather.sunIntensity).toBe(2.4);
  expect(earlier.grass.winds).toEqual(beforeExit.grass.winds);
  expect(earlier.grass.windHighlight).toBe(true);expect(earlier.grass.contactHighlight).toBe(true);
  expect(earlier.position).toEqual(start.position);
  await page.keyboard.press('9');await expect(page).toHaveURL(/s=9/);
  await page.getByRole('button', {name:'Weather',exact:true}).click();
  await expect(page.getByRole('button', {name:'Bring back rain',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Reset weather',exact:true}).click();
  await expect.poll(async () => (await snapshot()).weather.rain).toBeGreaterThan(.6);
  await page.getByRole('button', {name:'Close weather controls'}).click();
  await expect(page.locator('#weather-toggle')).toBeFocused();
  expect(errors).toEqual([]);
});

test('wetting and drying retain bounded state across step rates and rapid sky reversal', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const { WeatherState } = await import('/src/weather.ts');
    const run = (rate: number) => {
      const s = new WeatherState();s.active=true;s.rainfall=1;s.evening=1;
      for(let i=0;i<rate*20;i++)s.advance(1/rate);
      const wet = {...s};s.rainfall=0;s.evening=0;
      for(let i=0;i<rate*15;i++)s.advance(1/rate);
      const dry = {...s};s.evening=1;s.advance(1/rate);const turn=s.night;
      s.active=false;s.advance(500);return {wet,dry,turn,interrupted:{...s}};
    };
    return {slow:run(60),fast:run(144)};
  });
  for(const r of [result.slow,result.fast]) {
    expect(r.wet.wetness).toBeGreaterThan(.9);
    expect(r.dry.wetness).toBeLessThan(r.wet.wetness*.6);
    expect(r.dry.wetness).toBeGreaterThan(.2);
    expect(r.turn).toBeGreaterThan(r.dry.night);expect(r.turn).toBeLessThan(.03);
    expect(r.interrupted.wetness).toBeGreaterThan(r.dry.wetness-.01);
  }
  expect(Math.abs(result.slow.wet.wetness-result.fast.wet.wetness)).toBeLessThan(.003);
  expect(Math.abs(result.slow.dry.wetness-result.fast.dry.wetness)).toBeLessThan(.003);
});


test('wet surface roughness changes the reflected light without changing its color or silhouette', async ({ page }, info) => {
  const errors: string[] = [];page.on('console', m => { if(m.type()==='error')errors.push(m.text()); });
  await page.goto('/?s=9');await expect(page.locator('#loading')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().weather.blend)).toBeGreaterThan(.9);
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    // Use the actual scene material/environment on a fixed surface. Time, wind,
    // albedo and geometry cannot account for the observed change in reflection.
    const material = (window as any).__study.terrain.material.clone();
    material.color.set('#66794b');material.vertexColors=false;material.clearcoat=.9;
    const scene = new T.Scene();
    const plane = new T.Mesh(new T.PlaneGeometry(8,8),material);plane.rotation.x=-Math.PI/2;scene.add(plane);
    const light = new T.DirectionalLight(0xffffff,3);light.position.set(0,5,-5);scene.add(light);
    const camera = new T.PerspectiveCamera(48,1,.1,50);camera.position.set(0,3,5);camera.lookAt(0,0,0);
    const renderer = new T.WebGLRenderer({alpha:true});renderer.setSize(192,192);renderer.toneMapping=T.ACESFilmicToneMapping;
    const target = new T.WebGLRenderTarget(192,192);renderer.setRenderTarget(target);
    const render = (roughness: number) => {
      material.roughness=roughness;material.clearcoatRoughness=roughness;renderer.render(scene,camera);
      const pixels=new Uint8Array(192*192*4);renderer.readRenderTargetPixels(target,0,0,192,192,pixels);return pixels;
    };
    const narrow=render(.12),broad=render(.85);let difference=0,silhouette=0,peakNarrow=0,peakBroad=0;
    for(let i=0;i<narrow.length;i+=4){
      silhouette+=Number(narrow[i+3]!==broad[i+3]);
      for(let j=0;j<3;j++)difference+=Math.abs(narrow[i+j]-broad[i+j]);
      peakNarrow=Math.max(peakNarrow,narrow[i]);peakBroad=Math.max(peakBroad,broad[i]);
    }
    target.dispose();renderer.dispose();material.dispose();plane.geometry.dispose();
    return {difference:difference/(192*192*3),silhouette,peakNarrow,peakBroad};
  });
  await info.attach('roughness-render', {body:JSON.stringify(result),contentType:'application/json'});
  expect(result.difference).toBeGreaterThan(1);expect(result.silhouette).toBe(0);
  expect(result.peakNarrow).toBeGreaterThan(result.peakBroad);expect(errors).toEqual([]);
});


test('falling rain remains visible against the landscape and sky at normal and high DPI', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];page.on('console', m => {if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const results = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const {Weather} = await import('/src/weather.ts');
    const {GrassField} = await import('/src/field.ts');
    const {createTerrain,createLandmarks} = await import('/src/terrain.ts');
    const snap=(window as any).__study.snapshot();
    const scene=new T.Scene();scene.background=new T.Color('#e6ebdf');scene.fog=new T.Fog('#e6ebdf',45,105);
    const field=new GrassField();field.setMode(9);field.update(1.37,new T.Vector3(1000,0,1000),null);
    const terrain=createTerrain(),landmarks=createLandmarks();
    const sun=new T.DirectionalLight('#fff0ce',2.4),ambient=new T.HemisphereLight('#f7f5dd','#67795a',1.8);
    scene.add(terrain,landmarks,field.root,sun,sun.target,ambient);
    const camera=new T.PerspectiveCamera(48,1280/800,.1,180);
    camera.position.fromArray(snap.camera);camera.lookAt(new T.Vector3().fromArray(snap.position).add(new T.Vector3(0,1.1,0)));camera.updateMatrixWorld();
    const renderer=new T.WebGLRenderer({antialias:true});renderer.toneMapping=T.ACESFilmicToneMapping;
    const weather=new Weather(renderer,scene,field,terrain,landmarks,sun,ambient);weather.setMode(9);
    const rain=scene.getObjectByName('rain-streaks')!;
    const results=[];
    for(const dpr of [1,2]) {
      renderer.setPixelRatio(dpr);renderer.setSize(1280,800);
      const w=1280*dpr,h=800*dpr;
      const target=new T.WebGLRenderTarget(w,h,{samples:4});target.texture.colorSpace=T.SRGBColorSpace;
      const read=()=>{renderer.setRenderTarget(null);renderer.setRenderTarget(target);renderer.render(scene,camera);const bytes=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(target,0,0,w,h,bytes);if(!bytes.some(v=>v>0))throw new Error('Empty render target');return bytes;};
      for(const night of [0,1]) {
        Object.assign(weather.state,{rain:.65,rainfall:.65,blend:1,wetness:.7,night,evening:night});
        const offset=new T.Vector3();weather.update(0,camera,offset);
        sun.position.fromArray(snap.position).add(offset);sun.target.position.fromArray(snap.position);sun.target.updateMatrixWorld();
        field.updateDetail(camera,h);field.prepare(renderer,camera);
        renderer.setRenderTarget(target);rain.visible=false;const dry=read();rain.visible=true;const wet=read();
        let sky=0,ground=0,skyPixels=0,groundPixels=0,maxContrast=0;
        // Resolve device pixels into CSS pixels before measuring contrast. A
        // one-device-pixel glint must not count twice as much on a Retina screen.
        for(let y=0;y<800;y++)for(let x=0;x<1280;x++) {
          let contrast=0;
          for(let c=0;c<3;c++) {
            let a=0,b=0;
            for(let sy=0;sy<dpr;sy++)for(let sx=0;sx<dpr;sx++){
              const i=((y*dpr+sy)*w+x*dpr+sx)*4+c;a+=dry[i];b+=wet[i];
            }
            contrast=Math.max(contrast,Math.abs(a-b)/(dpr*dpr));
          }
          maxContrast=Math.max(maxContrast,contrast);
          // Top 10% is sky; bottom 60% is terrain/grass at this fixed view.
          if(y>=720){skyPixels++;if(contrast>=10)sky++;}
          if(y<480){groundPixels++;if(contrast>=10)ground++;}
        }
        results.push({dpr,night,sky:sky/skyPixels,ground:ground/groundPixels,maxContrast});
        Object.assign(weather.state,{rain:0,rainfall:0});weather.update(0,camera,offset);
        const stopped=read();rain.visible=false;const hidden=read();
        if(stopped.some((v,i)=>v!==hidden[i]))throw new Error('Stopped rain still changes the rendered frame');
      }
      renderer.setRenderTarget(null);target.dispose();
    }
    renderer.dispose();return results;
  });
  expect(errors).toEqual([]);
  await info.attach('rain-visibility', {body:JSON.stringify(results,null,2),contentType:'application/json'});
  for(const r of results) {
    expect(r.sky,JSON.stringify(r)).toBeGreaterThan(.003);
    expect(r.ground,JSON.stringify(r)).toBeGreaterThan(.003);
  }
  for(const night of [0,1]) {
    const normal=results.find(r=>r.dpr===1&&r.night===night)!;
    const high=results.find(r=>r.dpr===2&&r.night===night)!;
    expect(high.sky).toBeGreaterThan(normal.sky*.75);
    expect(high.ground).toBeGreaterThan(normal.ground*.75);
  }
  expect(errors).toEqual([]);
});
