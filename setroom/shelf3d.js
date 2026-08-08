(() => {
  'use strict';

  const SCALE = Object.freeze({ x: 3, y: 1.52, z: 1.65 });
  const BOARD = Object.freeze({ height: 9, post: 12, lip: 5 });
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  class ShelfStudio {
    constructor(container, options = {}) {
      if (!container) throw new Error('ShelfStudio requires a container.');
      this.container = container;
      this.options = options;
      this.camera = {
        yaw: Number(options.camera?.yaw ?? -16),
        pitch: Number(options.camera?.pitch ?? -9),
        zoom: Number(options.camera?.zoom ?? 0.9)
      };
      this.pointer = null;
      this.layout = new Map();
      this.boundMove = event => this.onPointerMove(event);
      this.boundUp = event => this.onPointerUp(event);
      this.boundKeyDown = event => this.onKeyDown(event);
      this.render();
      this.bind();
    }

    destroy() {
      this.container.removeEventListener('pointerdown', this.onPointerDownBound);
      this.container.removeEventListener('wheel', this.onWheelBound);
      this.container.removeEventListener('click', this.onClickBound);
      this.container.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('pointermove', this.boundMove);
      window.removeEventListener('pointerup', this.boundUp);
      window.removeEventListener('pointercancel', this.boundUp);
    }

    bind() {
      this.onPointerDownBound = event => this.onPointerDown(event);
      this.onWheelBound = event => this.onWheel(event);
      this.onClickBound = event => this.onClick(event);
      this.container.addEventListener('pointerdown', this.onPointerDownBound);
      this.container.addEventListener('wheel', this.onWheelBound, { passive: false });
      this.container.addEventListener('click', this.onClickBound);
      this.container.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('pointermove', this.boundMove);
      window.addEventListener('pointerup', this.boundUp);
      window.addEventListener('pointercancel', this.boundUp);
    }

    update(options = {}) {
      this.options = { ...this.options, ...options };
      if (options.camera) this.camera = { ...this.camera, ...options.camera };
      this.render();
    }

    render() {
      const shelves = Array.isArray(this.options.shelves) ? this.options.shelves : [];
      const maxWidth = Math.max(80, ...shelves.map(shelf => Number(shelf.width) || 0));
      const maxDepth = Math.max(35, ...shelves.map(shelf => Number(shelf.depth) || 0));
      const totalHeight = shelves.reduce((sum, shelf) => sum + (Number(shelf.height) || 0) * SCALE.y + BOARD.height, BOARD.height);
      const floorY = Math.min(230, totalHeight * 0.44);

      let cursorY = 0;
      const boards = [];
      const boxes = [];
      const labels = [];
      this.layout.clear();

      shelves.forEach((shelf, shelfIndex) => {
        const shelfWidth = Math.max(20, Number(shelf.width) || 0) * SCALE.x;
        const shelfDepth = Math.max(15, Number(shelf.depth) || 0) * SCALE.z;
        const clearHeight = Math.max(15, Number(shelf.height) || 0) * SCALE.y;
        const boardY = -cursorY;

        boards.push(this.cuboid({
          className: `shelf-board ${this.options.activeShelfId === shelf.id ? 'is-active' : ''}`,
          w: shelfWidth,
          h: BOARD.height,
          d: shelfDepth,
          x: 0,
          y: boardY,
          z: 0,
          attrs: `data-shelf-id="${esc(shelf.id)}" aria-label="Select ${esc(shelf.name)}"`
        }));

        boards.push(this.cuboid({
          className: 'shelf-lip',
          w: shelfWidth,
          h: BOARD.lip,
          d: 7,
          x: 0,
          y: boardY - BOARD.height / 2 - BOARD.lip / 2,
          z: shelfDepth / 2 - 3.5
        }));

        labels.push(`<button class="shelf-level-tag ${this.options.activeShelfId === shelf.id ? 'is-active' : ''}" type="button" data-shelf-id="${esc(shelf.id)}" style="--tag-x:${(-shelfWidth / 2 + 20).toFixed(2)}px;--tag-y:${(boardY + 2).toFixed(2)}px;--tag-z:${(shelfDepth / 2 + 9).toFixed(2)}px"><b>${shelfIndex + 1}</b><span>${esc(shelf.name)}</span></button>`);

        (shelf.placements || []).forEach((placement, placementIndex) => {
          const set = this.options.getSet?.(placement.setId);
          if (!set) return;
          const dims = this.options.getPlacementDimensions?.(placement, set) || set.dimensions || { w: 30, h: 20, d: 10 };
          const orientation = placement.orientation === 'rotated' ? 'rotated' : 'normal';
          const widthCm = orientation === 'rotated' ? Number(dims.d) : Number(dims.w);
          const depthCm = orientation === 'rotated' ? Number(dims.w) : Number(dims.d);
          const heightCm = Number(dims.h);
          const w = Math.max(10, widthCm * SCALE.x);
          const d = Math.max(6, depthCm * SCALE.z);
          const h = Math.max(12, heightCm * SCALE.y);
          const xCm = clamp(placement.x, 0, Math.max(0, Number(shelf.width) - widthCm));
          const zCm = clamp(placement.z, 0, Math.max(0, Number(shelf.depth) - depthCm));
          const x = -shelfWidth / 2 + xCm * SCALE.x + w / 2;
          const y = boardY - BOARD.height / 2 - h / 2;
          const z = -shelfDepth / 2 + zCm * SCALE.z + d / 2;
          const key = String(placement.id || `${shelf.id}-${placement.setId}-${placementIndex}`);
          const selected = key === String(this.options.selectedPlacementId || '');
          const entering = key === String(this.options.enteringPlacementId || '');

          this.layout.set(key, { shelf, shelfIndex, placement, set, widthCm, depthCm, heightCm, shelfWidth, shelfDepth, xCm, zCm, x, y, z, w, h, d });
          boxes.push(this.boxCuboid({ key, set, placement, w, h, d, x, y, z, selected, entering }));
        });

        if (this.options.ghost?.shelfId === shelf.id && this.options.ghost.set) {
          const ghost = this.options.ghost;
          const set = ghost.set;
          const dims = ghost.dimensions || set.dimensions || { w: 30, h: 20, d: 10 };
          const orientation = ghost.orientation === 'rotated' ? 'rotated' : 'normal';
          const widthCm = orientation === 'rotated' ? Number(dims.d) : Number(dims.w);
          const depthCm = orientation === 'rotated' ? Number(dims.w) : Number(dims.d);
          const heightCm = Number(dims.h);
          const w = Math.max(10, widthCm * SCALE.x);
          const d = Math.max(6, depthCm * SCALE.z);
          const h = Math.max(12, heightCm * SCALE.y);
          const x = -shelfWidth / 2 + (Number(ghost.x) || 0) * SCALE.x + w / 2;
          const y = boardY - BOARD.height / 2 - h / 2;
          const z = -shelfDepth / 2 + (Number(ghost.z) || 0) * SCALE.z + d / 2;
          boxes.push(this.boxCuboid({ key: 'ghost', set, placement: { orientation }, w, h, d, x, y, z, selected: false, entering: false, ghost: true, fits: ghost.fits !== false }));
        }

        cursorY += clearHeight + BOARD.height;
      });

      const topY = -cursorY;
      boards.push(this.cuboid({ className: 'shelf-board shelf-top', w: maxWidth * SCALE.x, h: BOARD.height, d: maxDepth * SCALE.z, x: 0, y: topY, z: 0 }));
      const postHeight = Math.max(120, cursorY + BOARD.height);
      const postY = -postHeight / 2 + BOARD.height / 2;
      const postX = maxWidth * SCALE.x / 2 + BOARD.post / 2;
      [-1, 1].forEach(side => boards.push(this.cuboid({ className: 'shelf-post', w: BOARD.post, h: postHeight, d: maxDepth * SCALE.z + 10, x: side * postX, y: postY, z: 0 })));
      [-0.34, 0.34].forEach(ratio => boards.push(this.cuboid({ className: 'shelf-back-rail', w: maxWidth * SCALE.x, h: 8, d: 7, x: 0, y: -postHeight * (0.5 + ratio), z: -maxDepth * SCALE.z / 2 - 2 })));

      this.container.innerHTML = `<div class="scene-toolbar" aria-label="3D shelf controls">
          <div class="scene-toolbar-group"><button type="button" data-camera="front" aria-label="Front view">Front</button><button type="button" data-camera="left" aria-label="Rotate left">↶</button><button type="button" data-camera="right" aria-label="Rotate right">↷</button></div>
          <div class="scene-toolbar-group"><button type="button" data-camera="out" aria-label="Zoom out">−</button><button type="button" data-camera="in" aria-label="Zoom in">+</button><button type="button" data-camera="reset">Reset</button></div>
        </div>
        <div class="scene-help"><span>Drag the room to look around</span><span>Select a box, then drag to move it</span></div>
        <div class="scene-viewport" style="--floor-y:${floorY.toFixed(2)}px">
          <div class="scene-floor"></div>
          <div class="shelf-world" data-shelf-world>${boards.join('')}${boxes.join('')}${labels.join('')}</div>
        </div>
        ${boxes.length === 0 ? '<div class="scene-empty"><strong>Your shelf is ready.</strong><span>Search for a set above to place the first box.</span></div>' : ''}`;

      this.world = this.container.querySelector('[data-shelf-world]');
      this.updateCamera(false);
    }

    cuboid({ className = '', w = 10, h = 10, d = 10, x = 0, y = 0, z = 0, ry = 0, attrs = '', faceContent = {} }) {
      const left = x - w / 2;
      const top = y - h / 2;
      const style = `--w:${w.toFixed(2)}px;--h:${h.toFixed(2)}px;--d:${d.toFixed(2)}px;--left:${left.toFixed(2)}px;--top:${top.toFixed(2)}px;--enter-top:${(top - 140).toFixed(2)}px;--z:${z.toFixed(2)}px;--half-w:${(w / 2).toFixed(2)}px;--half-h:${(h / 2).toFixed(2)}px;--half-d:${(d / 2).toFixed(2)}px;--side-left:${((w - d) / 2).toFixed(2)}px;--top-offset:${((h - d) / 2).toFixed(2)}px;--ry:${ry}deg`;
      return `<div class="cuboid ${className}" style="${style}" ${attrs}>
        <div class="cuboid-face face-front">${faceContent.front || ''}</div><div class="cuboid-face face-back">${faceContent.back || ''}</div><div class="cuboid-face face-left">${faceContent.left || ''}</div><div class="cuboid-face face-right">${faceContent.right || ''}</div><div class="cuboid-face face-top">${faceContent.top || ''}</div><div class="cuboid-face face-bottom">${faceContent.bottom || ''}</div>
      </div>`;
    }

    boxCuboid({ key, set, placement, w, h, d, x, y, z, selected, entering, ghost = false, fits = true }) {
      const image = set.image ? `<img src="${esc(set.image)}" alt="${esc(set.name)} box artwork" draggable="false" loading="eager" onerror="this.parentElement.classList.add('image-missing');this.remove()">` : '';
      const front = `${image}<div class="box-face-caption"><b>${esc(set.number || set.id)}</b><span>${esc(set.name)}</span></div>`;
      const side = `<span class="box-side-number">${esc(set.number || set.id)}</span>`;
      const classes = ['shelf-box', selected ? 'is-selected' : '', entering ? 'is-entering' : '', ghost ? 'is-ghost' : '', ghost && fits ? 'is-fit' : '', ghost && !fits ? 'is-no-fit' : ''].filter(Boolean).join(' ');
      const attrs = ghost ? 'aria-hidden="true"' : `data-box-key="${esc(key)}" tabindex="0" role="button" aria-label="${esc(set.name)}. Select and drag to move."`;
      return this.cuboid({ className: classes, w, h, d, x, y, z, ry: 0, attrs, faceContent: { front, back: side, left: side, right: side, top: `<span class="box-top-mark">${esc(set.theme || 'SETROOM')}</span>` } });
    }

    updateCamera(announce = true) {
      this.camera.yaw = clamp(this.camera.yaw, -58, 58);
      this.camera.pitch = clamp(this.camera.pitch, -27, 12);
      this.camera.zoom = clamp(this.camera.zoom, 0.58, 1.38);
      if (this.world) {
        this.world.style.setProperty('--camera-yaw', `${this.camera.yaw.toFixed(2)}deg`);
        this.world.style.setProperty('--camera-pitch', `${this.camera.pitch.toFixed(2)}deg`);
        this.world.style.setProperty('--camera-zoom', this.camera.zoom.toFixed(3));
      }
      if (announce) this.options.onCameraChange?.({ ...this.camera });
    }

    cameraAction(action) {
      if (action === 'front') Object.assign(this.camera, { yaw: 0, pitch: -5, zoom: 0.94 });
      if (action === 'left') this.camera.yaw -= 12;
      if (action === 'right') this.camera.yaw += 12;
      if (action === 'in') this.camera.zoom += 0.1;
      if (action === 'out') this.camera.zoom -= 0.1;
      if (action === 'reset') Object.assign(this.camera, { yaw: -16, pitch: -9, zoom: 0.9 });
      this.updateCamera();
    }

    onClick(event) {
      const cameraButton = event.target.closest('[data-camera]');
      if (cameraButton) return this.cameraAction(cameraButton.dataset.camera);
      const shelfButton = event.target.closest('[data-shelf-id]');
      if (shelfButton && !event.target.closest('[data-box-key]')) this.options.onShelfSelect?.(shelfButton.dataset.shelfId);
    }

    onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      const box = event.target.closest('[data-box-key]');
      if (box) {
        const key = box.dataset.boxKey;
        const item = this.layout.get(key);
        if (!item) return;
        event.preventDefault();
        this.pointer = { type: 'box', id: event.pointerId, key, element: box, startX: event.clientX, startY: event.clientY, xCm: item.xCm, zCm: item.zCm, nextX: item.xCm, nextZ: item.zCm, moved: false, item };
        box.classList.add('is-dragging');
        return;
      }
      if (event.target.closest('.scene-toolbar')) return;
      event.preventDefault();
      this.pointer = { type: 'camera', id: event.pointerId, startX: event.clientX, startY: event.clientY, yaw: this.camera.yaw, pitch: this.camera.pitch };
      this.container.classList.add('is-orbiting');
    }

    onPointerMove(event) {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const dx = event.clientX - this.pointer.startX;
      const dy = event.clientY - this.pointer.startY;
      if (this.pointer.type === 'camera') {
        this.camera.yaw = this.pointer.yaw + dx * 0.17;
        this.camera.pitch = this.pointer.pitch - dy * 0.11;
        this.updateCamera(false);
        return;
      }
      const item = this.pointer.item;
      const xCm = clamp(this.pointer.xCm + dx / (SCALE.x * this.camera.zoom), 0, Math.max(0, Number(item.shelf.width) - item.widthCm));
      const zCm = clamp(this.pointer.zCm + dy / (SCALE.z * this.camera.zoom), 0, Math.max(0, Number(item.shelf.depth) - item.depthCm));
      this.pointer.nextX = xCm;
      this.pointer.nextZ = zCm;
      this.pointer.moved = this.pointer.moved || Math.abs(dx) + Math.abs(dy) > 5;
      const x = -item.shelfWidth / 2 + xCm * SCALE.x + item.w / 2;
      const z = -item.shelfDepth / 2 + zCm * SCALE.z + item.d / 2;
      this.pointer.element.style.setProperty('--left', `${(x - item.w / 2).toFixed(2)}px`);
      this.pointer.element.style.setProperty('--z', `${z.toFixed(2)}px`);
      this.options.onMovePreview?.(this.pointer.key, { x: xCm, z: zCm, shelfId: item.shelf.id });
    }

    onPointerUp(event) {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const pointer = this.pointer;
      this.pointer = null;
      this.container.classList.remove('is-orbiting');
      if (pointer.type === 'camera') return this.updateCamera();
      pointer.element?.classList.remove('is-dragging');
      if (!pointer.moved) return this.options.onSelect?.(pointer.key);
      this.options.onMove?.(pointer.key, { x: pointer.nextX, z: pointer.nextZ, shelfId: pointer.item.shelf.id });
    }

    onKeyDown(event) {
      const box = event.target.closest('[data-box-key]');
      if (!box || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      this.options.onSelect?.(box.dataset.boxKey);
    }

    onWheel(event) {
      if (event.target.closest('input,select,textarea')) return;
      event.preventDefault();
      this.camera.zoom += event.deltaY > 0 ? -0.07 : 0.07;
      this.updateCamera();
    }
  }

  window.SetRoomShelf3D = Object.freeze({ ShelfStudio, SCALE });
})();
