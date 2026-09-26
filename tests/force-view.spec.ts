import { expect, test } from '@playwright/test';

test('Tab fades the common view, retains filters across studies and leaves interface navigation intact', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?s=8');await expect(page.locator('#loading')).toBeHidden();
  const state = () => page.evaluate(() => (window as any).__study.snapshot());
  const button = page.getByRole('button', { name: 'Force view', exact: true });
  const canvas = page.locator('#world');await canvas.focus();
  const initial = await state();
  await page.keyboard.down('Tab');await page.keyboard.down('Tab');await page.keyboard.up('Tab');
  await expect(canvas).toBeFocused();await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await state()).grass.forceView.weight).toBe(0);
  await page.keyboard.press('v');await expect.poll(async () => (await state()).grass.windHighlightWeight).toBe(0);
  await page.keyboard.press('Tab');await expect.poll(async () => (await state()).grass.forceView.weight).toBe(1);
  expect((await state()).grass.forceView).toMatchObject({ enabled: true, wind: false, contact: true });
  for (let mode = 9; mode <= 13; mode++) {
    await canvas.focus();await page.keyboard.press('l');
    await expect(page.locator('#study-number')).toHaveText(String(mode).padStart(2, '0'));
    await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
    expect((await state()).grass.forceView).toMatchObject({ enabled: true, wind: false, contact: true });
    await page.keyboard.press('Tab');await expect.poll(async () => (await state()).grass.forceView.weight).toBe(0);
    await page.keyboard.press('Tab');await expect.poll(async () => (await state()).grass.forceView.weight).toBe(1);
  }
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  await page.locator('.wind-entry > summary').first().click();
  const slider = page.getByRole('slider', { name: 'Wind 1 strength', exact: true });await slider.focus();
  await page.keyboard.press('Tab');expect((await state()).grass.forceView.enabled).toBe(true);
  await button.focus();await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Stats', exact: true })).toBeFocused();
  await button.focus();await page.keyboard.press('Enter');
  await expect.poll(async () => (await state()).grass.forceView.weight).toBe(0);
  await canvas.focus();await page.keyboard.press('Shift+Tab');
  await expect(canvas).not.toBeFocused();expect((await state()).grass.forceView.enabled).toBe(false);
  await canvas.focus();await page.keyboard.press('8');
  await expect(page.locator('#study-number')).toHaveText('08');
  expect((await state()).grass.winds).toEqual(initial.grass.winds);
  expect((await state()).grass.time).toBeGreaterThan(initial.grass.time);
  expect((await state()).position).toEqual(initial.position);
  await page.keyboard.press('F3');await expect(page.locator('#performance')).toBeVisible();
  await page.keyboard.press('Tab');await expect.poll(async () => (await state()).grass.forceView.weight).toBe(1);
  await expect(page.locator('#performance')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shared colors fade on every moving representation while force data and submitted geometry stay fixed', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { GrassField } = await import('/src/field.ts');const { GroundCover } = await import('/src/ground-cover.ts');
    const { createTerrain, heightAt } = await import('/src/terrain.ts');
    const field = new GrassField(), terrain = createTerrain(), cover = new GroundCover(field, terrain);
    field.windPatches.setEnabled(false);
    for (const [i, wind] of field.winds.winds.entries()) {
      (wind as any).bias = 1;(wind as any).gust = 0;field.winds.set(wind.id, { strength: i ? 0 : 1 });
    }
    const contact = field.interaction.texture.image.data as Uint8Array;
    for (let i = 0; i < contact.length; i += 4) { contact[i] = 230;contact[i + 1] = 128; }
    field.interaction.texture.needsUpdate = true;
    field.uniforms.grassTime.value = Math.PI / 3.6;
    const before = Array.from(contact), winds = field.winds.snapshot(), time = field.time;
    const renderer = new T.WebGLRenderer({ antialias: true });renderer.setSize(256,192);renderer.setClearColor(0,1);renderer.toneMapping=T.ACESFilmicToneMapping;
    const target = new T.WebGLRenderTarget(256,192,{samples:4});
    const scene = new T.Scene();scene.add(terrain,field.root,cover.root,new T.HemisphereLight(0xffffff,0x777777,2));
    const camera = new T.PerspectiveCamera(48,256/192,.1,120);
    camera.position.set(-5,heightAt(-5,9)+1.6,9);camera.lookAt(-5,heightAt(-5,5)+.1,5);camera.updateMatrixWorld();
    const draw = () => {
      field.updateDetail(camera,900);cover.update(camera,900,0,.3,null);
      renderer.setRenderTarget(null);renderer.setRenderTarget(target);renderer.render(scene,camera);
      const pixels = new Uint8Array(256*192*4);renderer.readRenderTargetPixels(target,0,0,256,192,pixels);
      return {pixels,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
    };
    const diff = (a:Uint8Array,b:Uint8Array) => {
      let color=0,alpha=0;for(let i=0;i<a.length;i+=4){for(let j=0;j<3;j++)color+=Math.abs(a[i+j]-b[i+j]);if(a[i+3]!==b[i+3])alpha++;}
      return {color:color/(256*192*3),alpha};
    };
    const countColors = (a:Uint8Array) => {
      let blue=0,orange=0;for(let i=0;i<a.length;i+=4){if(a[i+2]>a[i]*1.3&&a[i+2]>a[i+1]*1.1)blue++;if(a[i]>a[i+1]*1.3&&a[i+1]>a[i+2]*1.5)orange++;}return {blue,orange};
    };
    const reports=[];
    for(const [mode,kind] of [[2,'static'],[3,'sway'],[4,'cards'],[5,'blades'],[6,'contact'],[7,'combined'],[8,'field'],[9,'wet blades'],[10,'foundation'],[11,'opaque'],[11,'cards'],[12,'shells'],[13,'implicit']] as const){
      field.setMode(mode);cover.setMode(mode);cover.anchor=false;cover.tuftKind=kind==='cards'?'cards':'opaque';cover.sync();
      field.forceView.wind=field.forceView.contact=true;field.forceView.enabled=false;field.forceView.update(1);
      const off=draw();field.forceView.enabled=true;field.forceView.update(.225);const middle=draw();
      const halfWeight=field.forceView.snapshot().weight;field.forceView.update(.225);const on=draw();
      field.forceView.wind=false;field.forceView.update(.3);const contactOnly=draw();
      field.forceView.wind=true;field.forceView.contact=false;field.forceView.update(.3);const windOnly=draw();
      field.forceView.enabled=false;field.forceView.update(.45);const again=draw();
      reports.push({mode,kind,halfWeight,middle:diff(off.pixels,middle.pixels),full:diff(off.pixels,on.pixels),lastHalf:diff(middle.pixels,on.pixels),roundTrip:diff(off.pixels,again.pixels),
        both:countColors(on.pixels),contact:countColors(contactOnly.pixels),wind:countColors(windOnly.pixels),counts:[off,middle,on,contactOnly,windOnly,again].map(x=>[x.triangles,x.calls])});
    }
    // Cost/height explanations keep their own meaning over the common force view.
    cover.foundation=false;cover.sampleView=true;cover.setMode(13);field.setMode(13);cover.sync();
    field.forceView.enabled=false;field.forceView.update(1);const costOff=draw();field.forceView.enabled=true;field.forceView.update(1);const costOn=draw();
    const unchanged=JSON.stringify(before)===JSON.stringify(Array.from(contact))&&JSON.stringify(winds)===JSON.stringify(field.winds.snapshot())&&time===field.time;
    // Reversing midway continues from the current fade rather than restarting it.
    field.forceView.enabled=false;field.forceView.update(.1);const start=field.forceView.snapshot().weight;
    field.forceView.enabled=true;field.forceView.update(.1);const reversed=field.forceView.snapshot().weight;
    renderer.dispose();target.dispose();return {reports,unchanged,costDifference:diff(costOff.pixels,costOn.pixels),start,reversed};
  });
  await info.attach('force-view-render-checks',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  for(const r of result.reports){
    expect(r.halfWeight,r.kind).toBeCloseTo(.5);
    expect(r.roundTrip.color,r.kind).toBe(0);expect(r.full.alpha,r.kind).toBe(0);
    expect(r.counts.every(x=>JSON.stringify(x)===JSON.stringify(r.counts[0])),r.kind).toBe(true);
    if(r.mode===2){expect(r.full.color).toBe(0);continue;}
    expect(r.full.color,r.kind).toBeGreaterThan(.01);
    expect(r.middle.color,r.kind).toBeGreaterThan(.001);expect(r.lastHalf.color,r.kind).toBeGreaterThan(.001);
    if(r.mode>=7){expect(r.both.orange,r.kind).toBeGreaterThan(100);expect(r.contact.blue,r.kind).toBeGreaterThan(100);expect(r.wind.blue,r.kind).toBeGreaterThan(100);}
  }
  expect(result.unchanged).toBe(true);expect(result.costDifference.color).toBe(0);
  expect(result.start).toBeLessThan(1);expect(result.reversed).toBe(1);expect(errors).toEqual([]);
});
