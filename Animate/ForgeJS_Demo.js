(function (cjs, an) {

var p; // shortcut to reference prototypes
var lib={};var ss={};var img={};
lib.ssMetadata = [
		{name:"ForgeJS_Demo_atlas_1", frames: [[0,0,1920,900]]}
];


(lib.AnMovieClip = function(){
	this.actionFrames = [];
	this.ignorePause = false;
	this.gotoAndPlay = function(positionOrLabel){
		cjs.MovieClip.prototype.gotoAndPlay.call(this,positionOrLabel);
	}
	this.play = function(){
		cjs.MovieClip.prototype.play.call(this);
	}
	this.gotoAndStop = function(positionOrLabel){
		cjs.MovieClip.prototype.gotoAndStop.call(this,positionOrLabel);
	}
	this.stop = function(){
		cjs.MovieClip.prototype.stop.call(this);
	}
}).prototype = p = new cjs.MovieClip();
// symbols:



(lib.CourseForge_FullScreen = function() {
	this.initialize(ss["ForgeJS_Demo_atlas_1"]);
	this.gotoAndStop(0);
}).prototype = p = new cjs.Sprite();
// helper functions:

function mc_symbol_clone() {
	var clone = this._cloneProps(new this.constructor(this.mode, this.startPosition, this.loop, this.reversed));
	clone.gotoAndStop(this.currentFrame);
	clone.paused = this.paused;
	clone.framerate = this.framerate;
	return clone;
}

function getMCSymbolPrototype(symbol, nominalBounds, frameBounds) {
	var prototype = cjs.extend(symbol, cjs.MovieClip);
	prototype.clone = mc_symbol_clone;
	prototype.nominalBounds = nominalBounds;
	prototype.frameBounds = frameBounds;
	return prototype;
	}


(lib.HotspotCircle = function(mode,startPosition,loop,reversed) {
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	this.isSingleFrame = false;
	// timeline functions:
	this.frame_0 = function() {
		if(this.isSingleFrame) {
			return;
		}
		if(this.totalFrames == 1) {
			this.isSingleFrame = true;
		}
		if (this.forgeHotspot) this.forgeHotspot({
		  //id: "emergency", label: "Emergency stop",
		  shape: "circle"//, strokeColor: "#E2473F", fill: "rgba(226,71,63,0.15)"
		});
	}

	// actions tween:
	this.timeline.addTween(cjs.Tween.get(this).call(this.frame_0).wait(1));

	// Layer_1
	this.shape = new cjs.Shape();
	this.shape.graphics.f("rgba(0,255,255,0.498)").s().p("AlgFhQiTiSAAjPQAAjOCTiTQCSiSDOAAQDPAACSCSQCTCTAADOQAADPiTCSQiSCTjPAAQjOAAiSiTg");
	this.shape.setTransform(50,50);

	this.timeline.addTween(cjs.Tween.get(this.shape).wait(1));

	this._renderFirstFrame();

}).prototype = getMCSymbolPrototype(lib.HotspotCircle, new cjs.Rectangle(0,0,100,100), null);


(lib.BackgroundImage = function(mode,startPosition,loop,reversed) {
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	// Layer_1
	this.instance = new lib.CourseForge_FullScreen();

	this.timeline.addTween(cjs.Tween.get(this.instance).wait(1));

	this._renderFirstFrame();

}).prototype = p = new cjs.MovieClip();
p.nominalBounds = new cjs.Rectangle(0,0,1920,900);


// stage content:
(lib.ForgeJS_Demo = function(mode,startPosition,loop,reversed) {
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	this.actionFrames = [0,1,25,50,75,99];
	// timeline functions:
	this.frame_0 = function() {
		/* ---- 1. Frame-0 config (FRAME 0 of the main timeline) ---------------------
		 * One object that lists every expected stop up-front (so markers show before
		 * first play) AND sets the project-wide hotspot defaults. Frame NUMBERS, not
		 * seconds. All hotspot keys are optional — anything omitted uses the built-in
		 * brand default; CourseForge's project hotspot config (if set) overrides these.
		 * (window.forgeStops still works as a legacy alias for `stops`.) */
		window.FORGE_CONFIG = {
		  stops: [1, 25, 50, 75, 100],             // every expected stop, up front  (alias: frameTracker)
		  hotspot: {
		    strokeColor: "#66FFFF",          // border + resting color
		    overColor:   "#66FFFF",          // hover color
		    fill:        "rgba(0,0,0,0.0)",
		    shape:       "crcle",          // "rounded" | "square" | "circle"
		    radius:      6,                  // px, when shape is "rounded"
		    strokeWidth: 6,
		    hitPadding:  0,                  // grow the clickable box beyond the artwork
		    pulse:       true
		  }
		};
	}
	this.frame_1 = function() {
		this.forgeStop();
	}
	this.frame_25 = function() {
		this.forgeStop();
	}
	this.frame_50 = function() {
		this.forgeStop();
	}
	this.frame_75 = function() {
		this.forgeStop();
	}
	this.frame_99 = function() {
		this.forgeStop();
	}

	// actions tween:
	this.timeline.addTween(cjs.Tween.get(this).call(this.frame_0).wait(1).call(this.frame_1).wait(24).call(this.frame_25).wait(25).call(this.frame_50).wait(25).call(this.frame_75).wait(24).call(this.frame_99).wait(1));

	// Layer_3
	this.hs1 = new lib.HotspotCircle();
	this.hs1.name = "hs1";
	this.hs1.setTransform(1454.5,501.7,3.1357,3.1971,0,0,0,50,49.9);

	this.hs2 = new lib.HotspotCircle();
	this.hs2.name = "hs2";
	this.hs2.setTransform(532.2,263.5,2.193,2.2359,0,0,0,50,49.9);

	this.hs3 = new lib.HotspotCircle();
	this.hs3.name = "hs3";
	this.hs3.setTransform(805.1,376.4,3.1757,3.2378,0,0,0,49.9,49.9);

	this.hs4 = new lib.HotspotCircle();
	this.hs4.name = "hs4";
	this.hs4.setTransform(1331.8,206.2,2.4799,2.5288,0,0,0,50,49.8);

	this.timeline.addTween(cjs.Tween.get({}).to({state:[]}).to({state:[{t:this.hs1}]},1).to({state:[]},1).to({state:[{t:this.hs2}]},23).to({state:[]},1).to({state:[{t:this.hs3}]},24).to({state:[]},1).to({state:[{t:this.hs4}]},24).to({state:[]},1).wait(24));

	// background
	this.instance = new lib.BackgroundImage("synched",0);
	this.instance.setTransform(960,450,1,1,0,0,0,960,450);
	var instanceFilter_1 = new cjs.ColorFilter(0.15,0.15,0.15,1,0,0,0,0);
	this.instance.filters = [instanceFilter_1];
	this.instance.cache(-2,-2,1924,904);

	this.timeline.addTween(cjs.Tween.get(this.instance).wait(100));
	this.timeline.addTween(cjs.Tween.get(instanceFilter_1).wait(100));

	this._renderFirstFrame();

}).prototype = p = new lib.AnMovieClip();
p.nominalBounds = new cjs.Rectangle(960,450,960,450);
// library properties:
lib.properties = {
	id: '9A389DE6C52CEF4CA47E2E23D27BD0AD',
	width: 1920,
	height: 900,
	fps: 24,
	color: "#BCBCBC",
	opacity: 1.00,
	manifest: [
		{src:"images/ForgeJS_Demo_atlas_1.png", id:"ForgeJS_Demo_atlas_1"}
	],
	preloads: []
};



// bootstrap callback support:

(lib.Stage = function(canvas) {
	createjs.Stage.call(this, canvas);
}).prototype = p = new createjs.Stage();

p.setAutoPlay = function(autoPlay) {
	this.tickEnabled = autoPlay;
}
p.play = function() { this.tickEnabled = true; this.getChildAt(0).gotoAndPlay(this.getTimelinePosition()) }
p.stop = function(ms) { if(ms) this.seek(ms); this.tickEnabled = false; }
p.seek = function(ms) { this.tickEnabled = true; this.getChildAt(0).gotoAndStop(lib.properties.fps * ms / 1000); }
p.getDuration = function() { return this.getChildAt(0).totalFrames / lib.properties.fps * 1000; }

p.getTimelinePosition = function() { return this.getChildAt(0).currentFrame / lib.properties.fps * 1000; }

an.bootcompsLoaded = an.bootcompsLoaded || [];
if(!an.bootstrapListeners) {
	an.bootstrapListeners=[];
}

an.bootstrapCallback=function(fnCallback) {
	an.bootstrapListeners.push(fnCallback);
	if(an.bootcompsLoaded.length > 0) {
		for(var i=0; i<an.bootcompsLoaded.length; ++i) {
			fnCallback(an.bootcompsLoaded[i]);
		}
	}
};

an.compositions = an.compositions || {};
an.compositions['9A389DE6C52CEF4CA47E2E23D27BD0AD'] = {
	getStage: function() { return exportRoot.stage; },
	getLibrary: function() { return lib; },
	getSpriteSheet: function() { return ss; },
	getImages: function() { return img; }
};

an.compositionLoaded = function(id) {
	an.bootcompsLoaded.push(id);
	for(var j=0; j<an.bootstrapListeners.length; j++) {
		an.bootstrapListeners[j](id);
	}
}

an.getComposition = function(id) {
	return an.compositions[id];
}


an.makeResponsive = function(isResp, respDim, isScale, scaleType, domContainers) {		
	var lastW, lastH, lastS=1;		
	window.addEventListener('resize', resizeCanvas);		
	resizeCanvas();		
	function resizeCanvas() {			
		var w = lib.properties.width, h = lib.properties.height;			
		var iw = window.innerWidth, ih=window.innerHeight;			
		var pRatio = window.devicePixelRatio || 1, xRatio=iw/w, yRatio=ih/h, sRatio=1;			
		if(isResp) {                
			if((respDim=='width'&&lastW==iw) || (respDim=='height'&&lastH==ih)) {                    
				sRatio = lastS;                
			}				
			else if(!isScale) {					
				if(iw<w || ih<h)						
					sRatio = Math.min(xRatio, yRatio);				
			}				
			else if(scaleType==1) {					
				sRatio = Math.min(xRatio, yRatio);				
			}				
			else if(scaleType==2) {					
				sRatio = Math.max(xRatio, yRatio);				
			}			
		}
		domContainers[0].width = w * pRatio * sRatio;			
		domContainers[0].height = h * pRatio * sRatio;
		domContainers.forEach(function(container) {				
			container.style.width = w * sRatio + 'px';				
			container.style.height = h * sRatio + 'px';			
		});
		stage.scaleX = pRatio*sRatio;			
		stage.scaleY = pRatio*sRatio;
		lastW = iw; lastH = ih; lastS = sRatio;            
		stage.tickOnUpdate = false;            
		stage.update();            
		stage.tickOnUpdate = true;		
	}
}
an.handleSoundStreamOnTick = function(event) {
	if(!event.paused){
		var stageChild = stage.getChildAt(0);
		if(!stageChild.paused || stageChild.ignorePause){
			stageChild.syncStreamSounds();
		}
	}
}
an.handleFilterCache = function(event) {
	if(!event.paused){
		var target = event.target;
		if(target){
			if(target.filterCacheList){
				for(var index = 0; index < target.filterCacheList.length ; index++){
					var cacheInst = target.filterCacheList[index];
					if((cacheInst.startFrame <= target.currentFrame) && (target.currentFrame <= cacheInst.endFrame)){
						cacheInst.instance.cache(cacheInst.x, cacheInst.y, cacheInst.w, cacheInst.h);
					}
				}
			}
		}
	}
}


})(createjs = createjs||{}, AdobeAn = AdobeAn||{});
var createjs, AdobeAn;