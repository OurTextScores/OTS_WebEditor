
const libWasm = 'webmscore.lib.wasm'
const libData = 'webmscore.lib.data'
const libMem = 'webmscore.lib.mem.wasm'

const WebMscoreWorker = function () { 
(function () {

  var Module$1 = (() => {
    
    return (
  async function(moduleArg = {}) {
    var moduleRtn;

  var Module=moduleArg;var readyPromiseResolve,readyPromiseReject;var readyPromise=new Promise((resolve,reject)=>{readyPromiseResolve=resolve;readyPromiseReject=reject;});var ENVIRONMENT_IS_WEB=typeof window=="object";var ENVIRONMENT_IS_WORKER=typeof WorkerGlobalScope!="undefined";var ENVIRONMENT_IS_NODE=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string"&&process.type!="renderer";if(ENVIRONMENT_IS_NODE){var require=m=>process.getBuiltinModule(m);}Module["expectedDataFileDownloads"]??=0;Module["expectedDataFileDownloads"]++;(()=>{var isPthread=typeof ENVIRONMENT_IS_PTHREAD!="undefined"&&ENVIRONMENT_IS_PTHREAD;var isWasmWorker=typeof ENVIRONMENT_IS_WASM_WORKER!="undefined"&&ENVIRONMENT_IS_WASM_WORKER;if(isPthread||isWasmWorker)return;var isNode=typeof process==="object"&&typeof process.versions==="object"&&typeof process.versions.node==="string";function loadPackage(metadata){if(typeof window==="object"){window["encodeURIComponent"](window.location.pathname.substring(0,window.location.pathname.lastIndexOf("/"))+"/");}else if(typeof process==="undefined"&&typeof location!=="undefined"){encodeURIComponent(location.pathname.substring(0,location.pathname.lastIndexOf("/"))+"/");}var PACKAGE_NAME="browser/webmscore.lib.data";var REMOTE_PACKAGE_BASE="webmscore.lib.data";var REMOTE_PACKAGE_NAME=Module["locateFile"]?Module["locateFile"](REMOTE_PACKAGE_BASE,""):REMOTE_PACKAGE_BASE;var REMOTE_PACKAGE_SIZE=metadata["remote_package_size"];function fetchRemotePackage(packageName,packageSize,callback,errback){if(isNode){require("fs").readFile(packageName,(err,contents)=>{if(err){errback(err);}else {callback(contents.buffer);}});return}Module["dataFileDownloads"]??={};fetch(packageName).catch(cause=>Promise.reject(new Error(`Network Error: ${packageName}`,{cause}))).then(response=>{if(!response.ok){return Promise.reject(new Error(`${response.status}: ${response.url}`))}if(!response.body&&response.arrayBuffer){return response.arrayBuffer().then(callback)}const reader=response.body.getReader();const iterate=()=>reader.read().then(handleChunk).catch(cause=>Promise.reject(new Error(`Unexpected error while handling : ${response.url} ${cause}`,{cause})));const chunks=[];const headers=response.headers;const total=Number(headers.get("Content-Length")??packageSize);let loaded=0;const handleChunk=({done,value})=>{if(!done){chunks.push(value);loaded+=value.length;Module["dataFileDownloads"][packageName]={loaded,total};let totalLoaded=0;let totalSize=0;for(const download of Object.values(Module["dataFileDownloads"])){totalLoaded+=download.loaded;totalSize+=download.total;}Module["setStatus"]?.(`Downloading data... (${totalLoaded}/${totalSize})`);return iterate()}else {const packageData=new Uint8Array(chunks.map(c=>c.length).reduce((a,b)=>a+b,0));let offset=0;for(const chunk of chunks){packageData.set(chunk,offset);offset+=chunk.length;}callback(packageData.buffer);}};Module["setStatus"]?.("Downloading data...");return iterate()});}function handleError(error){console.error("package error:",error);}var fetchedCallback=null;var fetched=Module["getPreloadedPackage"]?Module["getPreloadedPackage"](REMOTE_PACKAGE_NAME,REMOTE_PACKAGE_SIZE):null;if(!fetched)fetchRemotePackage(REMOTE_PACKAGE_NAME,REMOTE_PACKAGE_SIZE,data=>{if(fetchedCallback){fetchedCallback(data);fetchedCallback=null;}else {fetched=data;}},handleError);function runWithFS(Module){function assert(check,msg){if(!check)throw msg+(new Error).stack}Module["FS_createPath"]("/","res",true,true);Module["FS_createPath"]("/res","data",true,true);Module["FS_createPath"]("/res","engraving",true,true);Module["FS_createPath"]("/res/engraving","instruments",true,true);Module["FS_createPath"]("/res/engraving","styles",true,true);Module["FS_createPath"]("/res","fonts",true,true);Module["FS_createPath"]("/res/fonts","bravura",true,true);Module["FS_createPath"]("/res/fonts","edwin",true,true);Module["FS_createPath"]("/res/fonts","finalebroadway",true,true);Module["FS_createPath"]("/res/fonts","finalemaestro",true,true);Module["FS_createPath"]("/res/fonts","gootville",true,true);Module["FS_createPath"]("/res/fonts","leland",true,true);Module["FS_createPath"]("/res/fonts","mscore",true,true);Module["FS_createPath"]("/res/fonts","musejazz",true,true);Module["FS_createPath"]("/res/fonts","petaluma",true,true);Module["FS_createPath"]("/res/fonts","smufl",true,true);Module["FS_createPath"]("/res","mpe",true,true);Module["FS_createPath"]("/res/mpe","resources",true,true);function DataRequest(start,end,audio){this.start=start;this.end=end;this.audio=audio;}DataRequest.prototype={requests:{},open:function(mode,name){this.name=name;this.requests[name]=this;Module["addRunDependency"](`fp ${this.name}`);},send:function(){},onload:function(){var byteArray=this.byteArray.subarray(this.start,this.end);this.finish(byteArray);},finish:function(byteArray){var that=this;Module["FS_createDataFile"](this.name,null,byteArray,true,true,true);Module["removeRunDependency"](`fp ${that.name}`);this.requests[this.name]=null;}};var files=metadata["files"];for(var i=0;i<files.length;++i){new DataRequest(files[i]["start"],files[i]["end"],files[i]["audio"]||0).open("GET",files[i]["filename"]);}function processPackageData(arrayBuffer){assert(arrayBuffer,"Loading data file failed.");assert(arrayBuffer.constructor.name===ArrayBuffer.name,"bad input to processPackageData");var byteArray=new Uint8Array(arrayBuffer);DataRequest.prototype.byteArray=byteArray;var files=metadata["files"];for(var i=0;i<files.length;++i){DataRequest.prototype.requests[files[i].filename].onload();}Module["removeRunDependency"]("datafile_browser/webmscore.lib.data");}Module["addRunDependency"]("datafile_browser/webmscore.lib.data");Module["preloadResults"]??={};Module["preloadResults"][PACKAGE_NAME]={fromCache:false};if(fetched){processPackageData(fetched);fetched=null;}else {fetchedCallback=processPackageData;}}if(Module["calledRun"]){runWithFS(Module);}else {(Module["preRun"]??=[]).push(runWithFS);}}loadPackage({files:[{filename:"/res/data/harmony_to_diagram.xml",start:0,end:2473761},{filename:"/res/engraving/instruments/instruments.xml",start:2473761,end:3291744},{filename:"/res/engraving/instruments/orders.xml",start:3291744,end:3302165},{filename:"/res/engraving/instruments/string_tunings_presets.json",start:3302165,end:3310148},{filename:"/res/engraving/styles/cchords_muse.xml",start:3310148,end:3351518},{filename:"/res/engraving/styles/cchords_nrb.xml",start:3351518,end:3392889},{filename:"/res/engraving/styles/cchords_rb.xml",start:3392889,end:3434270},{filename:"/res/engraving/styles/cchords_sym.xml",start:3434270,end:3475642},{filename:"/res/engraving/styles/chords.xml",start:3475642,end:3505708},{filename:"/res/engraving/styles/chords_jazz.xml",start:3505708,end:3521609},{filename:"/res/engraving/styles/chords_legacy.xml",start:3521609,end:3532792},{filename:"/res/engraving/styles/chords_std.xml",start:3532792,end:3548285},{filename:"/res/engraving/styles/gp-style.mss",start:3548285,end:3550593},{filename:"/res/engraving/styles/jazzchords.xml",start:3550593,end:3564602},{filename:"/res/engraving/styles/legacy-style-defaults-v1.mss",start:3564602,end:3619902},{filename:"/res/engraving/styles/legacy-style-defaults-v2.mss",start:3619902,end:3675222},{filename:"/res/engraving/styles/legacy-style-defaults-v3.mss",start:3675222,end:3730522},{filename:"/res/engraving/styles/legacy-style-defaults-v302.mss",start:3730522,end:3793978},{filename:"/res/engraving/styles/migration-306-style-Edwin.mss",start:3793978,end:3798972},{filename:"/res/engraving/styles/migration-306-style-Leland.mss",start:3798972,end:3800326},{filename:"/res/engraving/styles/stdchords.xml",start:3800326,end:3813954},{filename:"/res/fonts/FreeSerif.ttf",start:3813954,end:7117542},{filename:"/res/fonts/bravura/Bravura.otf",start:7117542,end:7630466},{filename:"/res/fonts/bravura/BravuraText.otf",start:7630466,end:8866978},{filename:"/res/fonts/bravura/metadata.json",start:8866978,end:9600520},{filename:"/res/fonts/edwin/Edwin-BdIta.otf",start:9600520,end:9724152},{filename:"/res/fonts/edwin/Edwin-Bold.otf",start:9724152,end:9845556},{filename:"/res/fonts/edwin/Edwin-Italic.otf",start:9845556,end:9968076},{filename:"/res/fonts/edwin/Edwin-Roman.otf",start:9968076,end:10088484},{filename:"/res/fonts/finalebroadway/metadata.json",start:10088484,end:10149276},{filename:"/res/fonts/finalemaestro/metadata.json",start:10149276,end:10535259},{filename:"/res/fonts/fonts_figuredbass.xml",start:10535259,end:10539621},{filename:"/res/fonts/fonts_tablature.xml",start:10539621,end:10577678},{filename:"/res/fonts/gootville/metadata.json",start:10577678,end:10761601},{filename:"/res/fonts/leland/Leland.otf",start:10761601,end:10850733},{filename:"/res/fonts/leland/LelandText.otf",start:10850733,end:10893121},{filename:"/res/fonts/leland/metadata.json",start:10893121,end:11043723},{filename:"/res/fonts/mscore-BC.ttf",start:11043723,end:11056119},{filename:"/res/fonts/mscore/metadata.json",start:11056119,end:11166443},{filename:"/res/fonts/mscoreTab.ttf",start:11166443,end:11190839},{filename:"/res/fonts/musejazz/metadata.json",start:11190839,end:11306298},{filename:"/res/fonts/petaluma/PetalumaScript.otf",start:11306298,end:11499858},{filename:"/res/fonts/petaluma/metadata.json",start:11499858,end:11869402},{filename:"/res/fonts/smufl/classes.json",start:11869402,end:11973919},{filename:"/res/fonts/smufl/glyphnames.json",start:11973919,end:12275602},{filename:"/res/fonts/smufl/ranges.json",start:12275602,end:12374398},{filename:"/res/mpe/resources/general_keyboard_articulations_profile.json",start:12374398,end:12575698},{filename:"/res/mpe/resources/general_percussion_articulations_profile.json",start:12575698,end:12939724},{filename:"/res/mpe/resources/general_strings_articulations_profile.json",start:12939724,end:13264879},{filename:"/res/mpe/resources/general_voice_articulations_profile.json",start:13264879,end:13507505},{filename:"/res/mpe/resources/general_winds_articulations_profile.json",start:13507505,end:13754257}],remote_package_size:13754257});})();var thisProgram="./this.program";var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){var fs=require("fs");var nodePath=require("path");if(!"".startsWith("data:")){scriptDirectory=nodePath.dirname(require("url").fileURLToPath(""))+"/";}readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:"utf8");return ret};if(process.argv.length>1){thisProgram=process.argv[1].replace(/\\/g,"/");}process.argv.slice(2);}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){if(ENVIRONMENT_IS_WORKER){scriptDirectory=self.location.href;}else if(typeof document!="undefined"&&document.currentScript){scriptDirectory=document.currentScript.src;}if(scriptDirectory.startsWith("blob:")){scriptDirectory="";}else {scriptDirectory=scriptDirectory.slice(0,scriptDirectory.replace(/[?#].*/,"").lastIndexOf("/")+1);}{if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)};}readAsync=async url=>{var response=await fetch(url,{credentials:"same-origin"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+" : "+response.url)};}}else;var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;var wasmMemory;var ABORT=false;var HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAP64,HEAPU64,HEAPF64;var isFileURI=filename=>filename.startsWith("file://");function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b);HEAP64=new BigInt64Array(b);HEAPU64=new BigUint64Array(b);}function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift());}}callRuntimeCallbacks(onPreRuns);}function initRuntime(){if(!Module["noFSInit"]&&!FS.initialized)FS.init();wasmExports["Z"]();FS.ignorePermissions=false;}function postRun(){if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift());}}callRuntimeCallbacks(onPostRuns);}var runDependencies=0;var dependenciesFulfilled=null;function addRunDependency(id){runDependencies++;Module["monitorRunDependencies"]?.(runDependencies);}function removeRunDependency(id){runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback();}}}function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);readyPromiseReject(e);throw e}var wasmBinaryFile;function findWasmBinary(){if(Module["locateFile"]){return locateFile("webmscore.lib.wasm")}return new URL("webmscore.lib.wasm","").href}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw "both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason);}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&typeof WebAssembly.instantiateStreaming=="function"&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation");}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){return {a:wasmImports}}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmMemory=wasmExports["Y"];updateMemoryViews();wasmTable=wasmExports["_"];removeRunDependency();return wasmExports}addRunDependency();function receiveInstantiationResult(result){return receiveInstance(result["instance"])}var info=getWasmImports();if(Module["instantiateWasm"]){return new Promise((resolve,reject)=>{Module["instantiateWasm"](info,(mod,inst)=>{resolve(receiveInstance(mod));});})}wasmBinaryFile??=findWasmBinary();try{var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}catch(e){readyPromiseReject(e);return Promise.reject(e)}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module);}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);function getValue(ptr,type="i8"){if(type.endsWith("*"))type="*";switch(type){case"i1":return HEAP8[ptr];case"i8":return HEAP8[ptr];case"i16":return HEAP16[ptr>>1];case"i32":return HEAP32[ptr>>2];case"i64":return HEAP64[ptr>>3];case"float":return HEAPF32[ptr>>2];case"double":return HEAPF64[ptr>>3];case"*":return HEAPU32[ptr>>2];default:abort(`invalid type for getValue: ${type}`);}}function setValue(ptr,value,type="i8"){if(type.endsWith("*"))type="*";switch(type){case"i1":HEAP8[ptr]=value;break;case"i8":HEAP8[ptr]=value;break;case"i16":HEAP16[ptr>>1]=value;break;case"i32":HEAP32[ptr>>2]=value;break;case"i64":HEAP64[ptr>>3]=BigInt(value);break;case"float":HEAPF32[ptr>>2]=value;break;case"double":HEAPF64[ptr>>3]=value;break;case"*":HEAPU32[ptr>>2]=value;break;default:abort(`invalid type for setValue: ${type}`);}}var stackRestore=val=>__emscripten_stack_restore(val);var stackSave=()=>_emscripten_stack_get_current();class ExceptionInfo{constructor(excPtr){this.excPtr=excPtr;this.ptr=excPtr-24;}set_type(type){HEAPU32[this.ptr+4>>2]=type;}get_type(){return HEAPU32[this.ptr+4>>2]}set_destructor(destructor){HEAPU32[this.ptr+8>>2]=destructor;}get_destructor(){return HEAPU32[this.ptr+8>>2]}set_caught(caught){caught=caught?1:0;HEAP8[this.ptr+12]=caught;}get_caught(){return HEAP8[this.ptr+12]!=0}set_rethrown(rethrown){rethrown=rethrown?1:0;HEAP8[this.ptr+13]=rethrown;}get_rethrown(){return HEAP8[this.ptr+13]!=0}init(type,destructor){this.set_adjusted_ptr(0);this.set_type(type);this.set_destructor(destructor);}set_adjusted_ptr(adjustedPtr){HEAPU32[this.ptr+16>>2]=adjustedPtr;}get_adjusted_ptr(){return HEAPU32[this.ptr+16>>2]}}var exceptionLast=0;var ___cxa_throw=(ptr,type,destructor)=>{var info=new ExceptionInfo(ptr);info.init(type,destructor);exceptionLast=ptr;throw exceptionLast};var syscallGetVarargI=()=>{var ret=HEAP32[+SYSCALLS.varargs>>2];SYSCALLS.varargs+=4;return ret};var syscallGetVarargP=syscallGetVarargI;var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1);}else if(last===".."){parts.splice(i,1);up++;}else if(up){parts.splice(i,1);up--;}}if(allowAboveRoot){for(;up;up--){parts.unshift("..");}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path=".";}if(path&&trailingSlash){path+="/";}return (isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return "."}if(dir){dir=dir.slice(0,-1);}return root+dir},basename:path=>path&&path.match(/([^\/]+|\/)\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join("/")),join2:(l,r)=>PATH.normalize(l+"/"+r)};var initRandomFill=()=>{if(ENVIRONMENT_IS_NODE){var nodeCrypto=require("crypto");return view=>nodeCrypto.randomFillSync(view)}return view=>crypto.getRandomValues(view)};var randomFill=view=>{(randomFill=initRandomFill())(view);};var PATH_FS={resolve:(...args)=>{var resolvedPath="",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return ""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path);}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return (resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return [];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..");}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};var UTF8Decoder=typeof TextDecoder!="undefined"?new TextDecoder:undefined;var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead=NaN)=>{var endIdx=idx+maxBytesToRead;var endPtr=idx;while(heapOrArray[endPtr]&&!(endPtr>=endIdx))++endPtr;if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2;}else {u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63;}if(u0<65536){str+=String.fromCharCode(u0);}else {var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023);}}return str};var FS_stdin_getChar_buffer=[];var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++;}else if(c<=2047){len+=2;}else if(c>=55296&&c<=57343){len+=4;++i;}else {len+=3;}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343){var u1=str.charCodeAt(++i);u=65536+((u&1023)<<10)|u1&1023;}if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u;}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63;}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;}else {if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;}}heap[outIdx]=0;return outIdx-startIdx};var intArrayFromString=(stringy,dontAddNull,length)=>{var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array};var FS_stdin_getChar=()=>{if(!FS_stdin_getChar_buffer.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;var fd=process.stdin.fd;try{bytesRead=fs.readSync(fd,buf,0,BUFSIZE);}catch(e){if(e.toString().includes("EOF"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString("utf-8");}}else if(typeof window!="undefined"&&typeof window.prompt=="function"){result=window.prompt("Input: ");if(result!==null){result+="\n";}}else;if(!result){return null}FS_stdin_getChar_buffer=intArrayFromString(result,true);}return FS_stdin_getChar_buffer.shift()};var TTY={ttys:[],init(){},shutdown(){},register(dev,ops){TTY.ttys[dev]={input:[],output:[],ops};FS.registerDevice(dev,TTY.stream_ops);},stream_ops:{open(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false;},close(stream){stream.tty.ops.fsync(stream.tty);},fsync(stream){stream.tty.ops.fsync(stream.tty);},read(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty);}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result;}if(bytesRead){stream.node.atime=Date.now();}return bytesRead},write(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i]);}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.mtime=stream.node.ctime=Date.now();}return i}},default_tty_ops:{get_char(tty){return FS_stdin_getChar()},put_char(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output));tty.output=[];}else {if(val!=0)tty.output.push(val);}},fsync(tty){if(tty.output?.length>0){out(UTF8ArrayToString(tty.output));tty.output=[];}},ioctl_tcgets(tty){return {c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(tty,optional_actions,data){return 0},ioctl_tiocgwinsz(tty){return [24,80]}},default_tty1_ops:{put_char(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output));tty.output=[];}else {if(val!=0)tty.output.push(val);}},fsync(tty){if(tty.output?.length>0){err(UTF8ArrayToString(tty.output));tty.output=[];}}}};var zeroMemory=(ptr,size)=>HEAPU8.fill(0,ptr,ptr+size);var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var mmapAlloc=size=>{size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(ptr)zeroMemory(ptr,size);return ptr};var MEMFS={ops_table:null,mount(mount){return MEMFS.createNode(null,"/",16895,0)},createNode(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}MEMFS.ops_table||={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={};}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=null;}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream;}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream;}node.atime=node.mtime=node.ctime=Date.now();if(parent){parent.contents[name]=node;parent.atime=parent.mtime=parent.ctime=node.atime;}return node},getFileDataAsTypedArray(node){if(!node.contents)return new Uint8Array(0);if(node.contents.subarray)return node.contents.subarray(0,node.usedBytes);return new Uint8Array(node.contents)},expandFileStorage(node,newCapacity){var prevCapacity=node.contents?node.contents.length:0;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity!=0)newCapacity=Math.max(newCapacity,256);var oldContents=node.contents;node.contents=new Uint8Array(newCapacity);if(node.usedBytes>0)node.contents.set(oldContents.subarray(0,node.usedBytes),0);},resizeFileStorage(node,newSize){if(node.usedBytes==newSize)return;if(newSize==0){node.contents=null;node.usedBytes=0;}else {var oldContents=node.contents;node.contents=new Uint8Array(newSize);if(oldContents){node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)));}node.usedBytes=newSize;}},node_ops:{getattr(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096;}else if(FS.isFile(node.mode)){attr.size=node.usedBytes;}else if(FS.isLink(node.mode)){attr.size=node.link.length;}else {attr.size=0;}attr.atime=new Date(node.atime);attr.mtime=new Date(node.mtime);attr.ctime=new Date(node.ctime);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr(node,attr){for(const key of ["mode","atime","mtime","ctime"]){if(attr[key]!=null){node[key]=attr[key];}}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size);}},lookup(parent,name){throw MEMFS.doesNotExistError},mknod(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename(old_node,new_dir,new_name){var new_node;try{new_node=FS.lookupNode(new_dir,new_name);}catch(e){}if(new_node){if(FS.isDir(old_node.mode)){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}FS.hashRemoveNode(new_node);}delete old_node.parent.contents[old_node.name];new_dir.contents[new_name]=old_node;old_node.name=new_name;new_dir.ctime=new_dir.mtime=old_node.parent.ctime=old_node.parent.mtime=Date.now();},unlink(parent,name){delete parent.contents[name];parent.ctime=parent.mtime=Date.now();},rmdir(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.ctime=parent.mtime=Date.now();},readdir(node){return [".","..",...Object.keys(node.contents)]},symlink(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);if(size>8&&contents.subarray){buffer.set(contents.subarray(position,position+size),offset);}else {for(var i=0;i<size;i++)buffer[offset+i]=contents[position+i];}return size},write(stream,buffer,offset,length,position,canOwn){if(buffer.buffer===HEAP8.buffer){canOwn=false;}if(!length)return 0;var node=stream.node;node.mtime=node.ctime=Date.now();if(buffer.subarray&&(!node.contents||node.contents.subarray)){if(canOwn){node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length;return length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length;return length}else if(position+length<=node.usedBytes){node.contents.set(buffer.subarray(offset,offset+length),position);return length}}MEMFS.expandFileStorage(node,position+length);if(node.contents.subarray&&buffer.subarray){node.contents.set(buffer.subarray(offset,offset+length),position);}else {for(var i=0;i<length;i++){node.contents[position+i]=buffer[offset+i];}}node.usedBytes=Math.max(node.usedBytes,position+length);return length},llseek(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position;}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes;}}if(position<0){throw new FS.ErrnoError(28)}return position},mmap(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents&&contents.buffer===HEAP8.buffer){allocated=false;ptr=contents.byteOffset;}else {allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}if(contents){if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length);}else {contents=Array.prototype.slice.call(contents,position,position+length);}}HEAP8.set(contents,ptr);}}return {ptr,allocated}},msync(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};var asyncLoad=async url=>{var arrayBuffer=await readAsync(url);return new Uint8Array(arrayBuffer)};var FS_createDataFile=(parent,name,fileData,canRead,canWrite,canOwn)=>{FS.createDataFile(parent,name,fileData,canRead,canWrite,canOwn);};var preloadPlugins=[];var FS_handledByPreloadPlugin=(byteArray,fullname,finish,onerror)=>{if(typeof Browser!="undefined")Browser.init();var handled=false;preloadPlugins.forEach(plugin=>{if(handled)return;if(plugin["canHandle"](fullname)){plugin["handle"](byteArray,fullname,finish,onerror);handled=true;}});return handled};var FS_createPreloadedFile=(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;function processData(byteArray){function finish(byteArray){preFinish?.();if(!dontCreateFile){FS_createDataFile(parent,name,byteArray,canRead,canWrite,canOwn);}onload?.();removeRunDependency();}if(FS_handledByPreloadPlugin(byteArray,fullname,finish,()=>{onerror?.();removeRunDependency();})){return}finish(byteArray);}addRunDependency();if(typeof url=="string"){asyncLoad(url).then(processData,onerror);}else {processData(url);}};var FS_modeStringToFlags=str=>{var flagModes={r:0,"r+":2,w:512|64|1,"w+":512|64|2,a:1024|64|1,"a+":1024|64|2};var flags=flagModes[str];if(typeof flags=="undefined"){throw new Error(`Unknown file open mode: ${str}`)}return flags};var FS_getMode=(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode};var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,filesystems:null,syncFSRequests:0,readFiles:{},ErrnoError:class{name="ErrnoError";constructor(errno){this.errno=errno;}},FSStream:class{shared={};get object(){return this.node}set object(val){this.node=val;}get isRead(){return (this.flags&2097155)!==1}get isWrite(){return (this.flags&2097155)!==0}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(val){this.shared.flags=val;}get position(){return this.shared.position}set position(val){this.shared.position=val;}},FSNode:class{node_ops={};stream_ops={};readMode=292|73;writeMode=146;mounted=null;constructor(parent,name,mode,rdev){if(!parent){parent=this;}this.parent=parent;this.mount=parent.mount;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.rdev=rdev;this.atime=this.mtime=this.ctime=Date.now();}get read(){return (this.mode&this.readMode)===this.readMode}set read(val){val?this.mode|=this.readMode:this.mode&=~this.readMode;}get write(){return (this.mode&this.writeMode)===this.writeMode}set write(val){val?this.mode|=this.writeMode:this.mode&=~this.writeMode;}get isFolder(){return FS.isDir(this.mode)}get isDevice(){return FS.isChrdev(this.mode)}},lookupPath(path,opts={}){if(!path){throw new FS.ErrnoError(44)}opts.follow_mount??=true;if(!PATH.isAbs(path)){path=FS.cwd()+"/"+path;}linkloop:for(var nlinks=0;nlinks<40;nlinks++){var parts=path.split("/").filter(p=>!!p);var current=FS.root;var current_path="/";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}if(parts[i]==="."){continue}if(parts[i]===".."){current_path=PATH.dirname(current_path);if(FS.isRoot(current)){path=current_path+"/"+parts.slice(i+1).join("/");continue linkloop}else {current=current.parent;}continue}current_path=PATH.join2(current_path,parts[i]);try{current=FS.lookupNode(current,parts[i]);}catch(e){if(e?.errno===44&&islast&&opts.noent_okay){return {path:current_path}}throw e}if(FS.isMountpoint(current)&&(!islast||opts.follow_mount)){current=current.mounted.root;}if(FS.isLink(current.mode)&&(!islast||opts.follow)){if(!current.node_ops.readlink){throw new FS.ErrnoError(52)}var link=current.node_ops.readlink(current);if(!PATH.isAbs(link)){link=PATH.dirname(current_path)+"/"+link;}path=link+"/"+parts.slice(i+1).join("/");continue linkloop}}return {path:current_path,node:current}}throw new FS.ErrnoError(32)},getPath(node){var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!=="/"?`${mount}/${path}`:mount+path}path=path?`${node.name}/${path}`:node.name;node=node.parent;}},hashName(parentid,name){var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0;}return (parentid+hash>>>0)%FS.nameTable.length},hashAddNode(node){var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node;},hashRemoveNode(node){var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next;}else {var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next;}}},lookupNode(parent,name){var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode(parent,name,mode,rdev){var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode(node){FS.hashRemoveNode(node);},isRoot(node){return node===node.parent},isMountpoint(node){return !!node.mounted},isFile(mode){return (mode&61440)===32768},isDir(mode){return (mode&61440)===16384},isLink(mode){return (mode&61440)===40960},isChrdev(mode){return (mode&61440)===8192},isBlkdev(mode){return (mode&61440)===24576},isFIFO(mode){return (mode&61440)===4096},isSocket(mode){return (mode&49152)===49152},flagsToPermissionString(flag){var perms=["r","w","rw"][flag&3];if(flag&512){perms+="w";}return perms},nodePermissions(node,perms){if(FS.ignorePermissions){return 0}if(perms.includes("r")&&!(node.mode&292)){return 2}else if(perms.includes("w")&&!(node.mode&146)){return 2}else if(perms.includes("x")&&!(node.mode&73)){return 2}return 0},mayLookup(dir){if(!FS.isDir(dir.mode))return 54;var errCode=FS.nodePermissions(dir,"x");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate(dir,name){if(!FS.isDir(dir.mode)){return 54}try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,"wx")},mayDelete(dir,name,isdir){var node;try{node=FS.lookupNode(dir,name);}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,"wx");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else {if(FS.isDir(node.mode)){return 31}}return 0},mayOpen(node,flags){if(!node){return 44}if(FS.isLink(node.mode)){return 32}else if(FS.isDir(node.mode)){if(FS.flagsToPermissionString(flags)!=="r"||flags&(512|64)){return 31}}return FS.nodePermissions(node,FS.flagsToPermissionString(flags))},checkOpExists(op,err){if(!op){throw new FS.ErrnoError(err)}return op},MAX_OPEN_FDS:4096,nextfd(){for(var fd=0;fd<=FS.MAX_OPEN_FDS;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStreamChecked(fd){var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}return stream},getStream:fd=>FS.streams[fd],createStream(stream,fd=-1){stream=Object.assign(new FS.FSStream,stream);if(fd==-1){fd=FS.nextfd();}stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream(fd){FS.streams[fd]=null;},dupStream(origStream,fd=-1){var stream=FS.createStream(origStream,fd);stream.stream_ops?.dup?.(stream);return stream},doSetAttr(stream,node,attr){var setattr=stream?.stream_ops.setattr;var arg=setattr?stream:node;setattr??=node.node_ops.setattr;FS.checkOpExists(setattr,63);setattr(arg,attr);},chrdev_stream_ops:{open(stream){var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;stream.stream_ops.open?.(stream);},llseek(){throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice(dev,ops){FS.devices[dev]={stream_ops:ops};},getDevice:dev=>FS.devices[dev],getMounts(mount){var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push(...m.mounts);}return mounts},syncfs(populate,callback){if(typeof populate=="function"){callback=populate;populate=false;}FS.syncFSRequests++;if(FS.syncFSRequests>1){err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null);}}mounts.forEach(mount=>{if(!mount.type.syncfs){return done(null)}mount.type.syncfs(mount,populate,done);});},mount(type,opts,mountpoint){var root=mountpoint==="/";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type,opts,mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot;}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount);}}return mountRoot},unmount(mountpoint){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);Object.keys(FS.nameTable).forEach(hash=>{var current=FS.nameTable[hash];while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current);}current=next;}});node.mounted=null;var idx=node.mount.mounts.indexOf(mount);node.mount.mounts.splice(idx,1);},lookup(parent,name){return parent.node_ops.lookup(parent,name)},mknod(path,mode,dev){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name){throw new FS.ErrnoError(28)}if(name==="."||name===".."){throw new FS.ErrnoError(20)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},statfs(path){return FS.statfsNode(FS.lookupPath(path,{follow:true}).node)},statfsStream(stream){return FS.statfsNode(stream.node)},statfsNode(node){var rtn={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:FS.nextInode,ffree:FS.nextInode-1,fsid:42,flags:2,namelen:255};if(node.node_ops.statfs){Object.assign(rtn,node.node_ops.statfs(node.mount.opts.root));}return rtn},create(path,mode=438){mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir(path,mode=511){mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree(path,mode){var dirs=path.split("/");var d="";for(var dir of dirs){if(!dir)continue;if(d||PATH.isAbs(path))d+="/";d+=dir;try{FS.mkdir(d,mode);}catch(e){if(e.errno!=20)throw e}}},mkdev(path,mode,dev){if(typeof dev=="undefined"){dev=mode;mode=438;}mode|=8192;return FS.mknod(path,mode,dev)},symlink(oldpath,newpath){if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename(old_path,new_path){var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name);}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,"w");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);old_node.parent=new_dir;}catch(e){throw e}finally{FS.hashAddNode(old_node);}},rmdir(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node);},readdir(path){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var readdir=FS.checkOpExists(node.node_ops.readdir,54);return readdir(node)},unlink(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node);},readlink(path){var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return link.node_ops.readlink(link)},stat(path,dontFollow){var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;var getattr=FS.checkOpExists(node.node_ops.getattr,63);return getattr(node)},fstat(fd){var stream=FS.getStreamChecked(fd);var node=stream.node;var getattr=stream.stream_ops.getattr;var arg=getattr?stream:node;getattr??=node.node_ops.getattr;FS.checkOpExists(getattr,63);return getattr(arg)},lstat(path){return FS.stat(path,true)},doChmod(stream,node,mode,dontFollow){FS.doSetAttr(stream,node,{mode:mode&4095|node.mode&~4095,ctime:Date.now(),dontFollow});},chmod(path,mode,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node;}else {node=path;}FS.doChmod(null,node,mode,dontFollow);},lchmod(path,mode){FS.chmod(path,mode,true);},fchmod(fd,mode){var stream=FS.getStreamChecked(fd);FS.doChmod(stream,stream.node,mode,false);},doChown(stream,node,dontFollow){FS.doSetAttr(stream,node,{timestamp:Date.now(),dontFollow});},chown(path,uid,gid,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node;}else {node=path;}FS.doChown(null,node,dontFollow);},lchown(path,uid,gid){FS.chown(path,uid,gid,true);},fchown(fd,uid,gid){var stream=FS.getStreamChecked(fd);FS.doChown(stream,stream.node,false);},doTruncate(stream,node,len){if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,"w");if(errCode){throw new FS.ErrnoError(errCode)}FS.doSetAttr(stream,node,{size:len,timestamp:Date.now()});},truncate(path,len){if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node;}else {node=path;}FS.doTruncate(null,node,len);},ftruncate(fd,len){var stream=FS.getStreamChecked(fd);if(len<0||(stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.doTruncate(stream,stream.node,len);},utime(path,atime,mtime){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var setattr=FS.checkOpExists(node.node_ops.setattr,63);setattr(node,{atime,mtime});},open(path,flags,mode=438){if(path===""){throw new FS.ErrnoError(44)}flags=typeof flags=="string"?FS_modeStringToFlags(flags):flags;if(flags&64){mode=mode&4095|32768;}else {mode=0;}var node;var isDirPath;if(typeof path=="object"){node=path;}else {isDirPath=path.endsWith("/");var lookup=FS.lookupPath(path,{follow:!(flags&131072),noent_okay:true});node=lookup.node;path=lookup.path;}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else if(isDirPath){throw new FS.ErrnoError(31)}else {node=FS.mknod(path,mode|511,0);created=true;}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512;}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0);}flags&=~(128|512|131072);var stream=FS.createStream({node,path:FS.getPath(node),flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream);}if(created){FS.chmod(node,mode&511);}if(Module["logReadFiles"]&&!(flags&1)){if(!(path in FS.readFiles)){FS.readFiles[path]=1;}}return stream},close(stream){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream);}}catch(e){throw e}finally{FS.closeStream(stream.fd);}stream.fd=null;},isClosed(stream){return stream.fd===null},llseek(stream,offset,whence){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read(stream,buffer,offset,length,position){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position;}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write(stream,buffer,offset,length,position,canOwn){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2);}var seeking=typeof position!="undefined";if(!seeking){position=stream.position;}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},mmap(stream,length,position,prot,flags){if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}if(!length){throw new FS.ErrnoError(28)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync(stream,buffer,offset,length,mmapFlags){if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},ioctl(stream,cmd,arg){if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile(path,opts={}){opts.flags=opts.flags||0;opts.encoding=opts.encoding||"binary";if(opts.encoding!=="utf8"&&opts.encoding!=="binary"){throw new Error(`Invalid encoding type "${opts.encoding}"`)}var ret;var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding==="utf8"){ret=UTF8ArrayToString(buf);}else if(opts.encoding==="binary"){ret=buf;}FS.close(stream);return ret},writeFile(path,data,opts={}){opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);if(typeof data=="string"){var buf=new Uint8Array(lengthBytesUTF8(data)+1);var actualNumBytes=stringToUTF8Array(data,buf,0,buf.length);FS.write(stream,buf,0,actualNumBytes,undefined,opts.canOwn);}else if(ArrayBuffer.isView(data)){FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn);}else {throw new Error("Unsupported data type")}FS.close(stream);},cwd:()=>FS.currentPath,chdir(path){var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,"x");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path;},createDefaultDirectories(){FS.mkdir("/tmp");FS.mkdir("/home");FS.mkdir("/home/web_user");},createDefaultDevices(){FS.mkdir("/dev");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length,llseek:()=>0});FS.mkdev("/dev/null",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev("/dev/tty",FS.makedev(5,0));FS.mkdev("/dev/tty1",FS.makedev(6,0));var randomBuffer=new Uint8Array(1024),randomLeft=0;var randomByte=()=>{if(randomLeft===0){randomFill(randomBuffer);randomLeft=randomBuffer.byteLength;}return randomBuffer[--randomLeft]};FS.createDevice("/dev","random",randomByte);FS.createDevice("/dev","urandom",randomByte);FS.mkdir("/dev/shm");FS.mkdir("/dev/shm/tmp");},createSpecialDirectories(){FS.mkdir("/proc");var proc_self=FS.mkdir("/proc/self");FS.mkdir("/proc/self/fd");FS.mount({mount(){var node=FS.createNode(proc_self,"fd",16895,73);node.stream_ops={llseek:MEMFS.stream_ops.llseek};node.node_ops={lookup(parent,name){var fd=+name;var stream=FS.getStreamChecked(fd);var ret={parent:null,mount:{mountpoint:"fake"},node_ops:{readlink:()=>stream.path},id:fd+1};ret.parent=ret;return ret},readdir(){return Array.from(FS.streams.entries()).filter(([k,v])=>v).map(([k,v])=>k.toString())}};return node}},{},"/proc/self/fd");},createStandardStreams(input,output,error){if(input){FS.createDevice("/dev","stdin",input);}else {FS.symlink("/dev/tty","/dev/stdin");}if(output){FS.createDevice("/dev","stdout",null,output);}else {FS.symlink("/dev/tty","/dev/stdout");}if(error){FS.createDevice("/dev","stderr",null,error);}else {FS.symlink("/dev/tty1","/dev/stderr");}FS.open("/dev/stdin",0);FS.open("/dev/stdout",1);FS.open("/dev/stderr",1);},staticInit(){FS.nameTable=new Array(4096);FS.mount(MEMFS,{},"/");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={MEMFS};},init(input,output,error){FS.initialized=true;input??=Module["stdin"];output??=Module["stdout"];error??=Module["stderr"];FS.createStandardStreams(input,output,error);},quit(){FS.initialized=false;for(var stream of FS.streams){if(stream){FS.close(stream);}}},findObject(path,dontResolveLastLink){var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath(path,dontResolveLastLink){try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path;}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path==="/";}catch(e){ret.error=e.errno;}return ret},createPath(parent,path,canRead,canWrite){parent=typeof parent=="string"?parent:FS.getPath(parent);var parts=path.split("/").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current);}catch(e){if(e.errno!=20)throw e}parent=current;}return current},createFile(parent,name,properties,canRead,canWrite){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile(parent,name,data,canRead,canWrite,canOwn){var path=name;if(parent){parent=typeof parent=="string"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent;}var mode=FS_getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){if(typeof data=="string"){var arr=new Array(data.length);for(var i=0,len=data.length;i<len;++i)arr[i]=data.charCodeAt(i);data=arr;}FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode);}},createDevice(parent,name,input,output){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(!!input,!!output);FS.createDevice.major??=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open(stream){stream.seekable=false;},close(stream){if(output?.buffer?.length){output(10);}},read(stream,buffer,offset,length,pos){var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input();}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result;}if(bytesRead){stream.node.atime=Date.now();}return bytesRead},write(stream,buffer,offset,length,pos){for(var i=0;i<length;i++){try{output(buffer[offset+i]);}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.mtime=stream.node.ctime=Date.now();}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile(obj){if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(typeof XMLHttpRequest!="undefined"){throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")}else {try{obj.contents=readBinary(obj.url);obj.usedBytes=obj.contents.length;}catch(e){throw new FS.ErrnoError(29)}}},createLazyFile(parent,name,url,canRead,canWrite){class LazyUint8Array{lengthKnown=false;chunks=[];get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]}setDataGetter(getter){this.getter=getter;}cacheLength(){var xhr=new XMLHttpRequest;xhr.open("HEAD",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))throw new Error("Couldn't load "+url+". Status: "+xhr.status);var datalength=Number(xhr.getResponseHeader("Content-length"));var header;var hasByteServing=(header=xhr.getResponseHeader("Accept-Ranges"))&&header==="bytes";var usesGzip=(header=xhr.getResponseHeader("Content-Encoding"))&&header==="gzip";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)throw new Error("invalid range ("+from+", "+to+") or no bytes requested!");if(to>datalength-1)throw new Error("only "+datalength+" bytes available! programmer error!");var xhr=new XMLHttpRequest;xhr.open("GET",url,false);if(datalength!==chunkSize)xhr.setRequestHeader("Range","bytes="+from+"-"+to);xhr.responseType="arraybuffer";if(xhr.overrideMimeType){xhr.overrideMimeType("text/plain; charset=x-user-defined");}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))throw new Error("Couldn't load "+url+". Status: "+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||"",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]=="undefined"){lazyArray.chunks[chunkNum]=doXHR(start,end);}if(typeof lazyArray.chunks[chunkNum]=="undefined")throw new Error("doXHR failed!");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out("LazyFiles on gzip forces download of the whole file when length is accessed");}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true;}get length(){if(!this.lengthKnown){this.cacheLength();}return this._length}get chunkSize(){if(!this.lengthKnown){this.cacheLength();}return this._chunkSize}}if(typeof XMLHttpRequest!="undefined"){if(!ENVIRONMENT_IS_WORKER)throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";var lazyArray=new LazyUint8Array;var properties={isDevice:false,contents:lazyArray};}else {var properties={isDevice:false,url};}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents;}else if(properties.url){node.contents=null;node.url=properties.url;}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};var keys=Object.keys(node.stream_ops);keys.forEach(key=>{var fn=node.stream_ops[key];stream_ops[key]=(...args)=>{FS.forceLoadFile(node);return fn(...args)};});function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i];}}else {for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i);}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,HEAP8,ptr,length,position);return {ptr,allocated:true}};node.stream_ops=stream_ops;return node}};var UTF8ToString=(ptr,maxBytesToRead)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead):"";var SYSCALLS={DEFAULT_POLLMASK:5,calculateAt(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd();}else {var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path;}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return dir+"/"+path},writeStat(buf,stat){HEAP32[buf>>2]=stat.dev;HEAP32[buf+4>>2]=stat.mode;HEAPU32[buf+8>>2]=stat.nlink;HEAP32[buf+12>>2]=stat.uid;HEAP32[buf+16>>2]=stat.gid;HEAP32[buf+20>>2]=stat.rdev;HEAP64[buf+24>>3]=BigInt(stat.size);HEAP32[buf+32>>2]=4096;HEAP32[buf+36>>2]=stat.blocks;var atime=stat.atime.getTime();var mtime=stat.mtime.getTime();var ctime=stat.ctime.getTime();HEAP64[buf+40>>3]=BigInt(Math.floor(atime/1e3));HEAPU32[buf+48>>2]=atime%1e3*1e3*1e3;HEAP64[buf+56>>3]=BigInt(Math.floor(mtime/1e3));HEAPU32[buf+64>>2]=mtime%1e3*1e3*1e3;HEAP64[buf+72>>3]=BigInt(Math.floor(ctime/1e3));HEAPU32[buf+80>>2]=ctime%1e3*1e3*1e3;HEAP64[buf+88>>3]=BigInt(stat.ino);return 0},writeStatFs(buf,stats){HEAP32[buf+4>>2]=stats.bsize;HEAP32[buf+40>>2]=stats.bsize;HEAP32[buf+8>>2]=stats.blocks;HEAP32[buf+12>>2]=stats.bfree;HEAP32[buf+16>>2]=stats.bavail;HEAP32[buf+20>>2]=stats.files;HEAP32[buf+24>>2]=stats.ffree;HEAP32[buf+28>>2]=stats.fsid;HEAP32[buf+44>>2]=stats.flags;HEAP32[buf+36>>2]=stats.namelen;},doMsync(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=HEAPU8.slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags);},getStreamFromFD(fd){var stream=FS.getStreamChecked(fd);return stream},varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};function ___syscall_fcntl64(fd,cmd,varargs){SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=syscallGetVarargI();if(arg<0){return -28}while(FS.streams[arg]){arg++;}var newStream;newStream=FS.dupStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=syscallGetVarargI();stream.flags|=arg;return 0}case 12:{var arg=syscallGetVarargP();var offset=0;HEAP16[arg+offset>>1]=2;return 0}case 13:case 14:return 0}return -28}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function ___syscall_fstat64(fd,buf){try{return SYSCALLS.writeStat(buf,FS.fstat(fd))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite);function ___syscall_getdents64(fd,dirp,count){try{var stream=SYSCALLS.getStreamFromFD(fd);stream.getdents||=FS.readdir(stream.path);var struct_size=280;var pos=0;var off=FS.llseek(stream,0,1);var startIdx=Math.floor(off/struct_size);var endIdx=Math.min(stream.getdents.length,startIdx+Math.floor(count/struct_size));for(var idx=startIdx;idx<endIdx;idx++){var id;var type;var name=stream.getdents[idx];if(name==="."){id=stream.node.id;type=4;}else if(name===".."){var lookup=FS.lookupPath(stream.path,{parent:true});id=lookup.node.id;type=4;}else {var child;try{child=FS.lookupNode(stream.node,name);}catch(e){if(e?.errno===28){continue}throw e}id=child.id;type=FS.isChrdev(child.mode)?2:FS.isDir(child.mode)?4:FS.isLink(child.mode)?10:8;}HEAP64[dirp+pos>>3]=BigInt(id);HEAP64[dirp+pos+8>>3]=BigInt((idx+1)*struct_size);HEAP16[dirp+pos+16>>1]=280;HEAP8[dirp+pos+18]=type;stringToUTF8(name,dirp+pos+19,256);pos+=struct_size;}FS.llseek(stream,idx*struct_size,0);return pos}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function ___syscall_ioctl(fd,op,varargs){SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:{if(!stream.tty)return -59;return 0}case 21505:{if(!stream.tty)return -59;if(stream.tty.ops.ioctl_tcgets){var termios=stream.tty.ops.ioctl_tcgets(stream);var argp=syscallGetVarargP();HEAP32[argp>>2]=termios.c_iflag||0;HEAP32[argp+4>>2]=termios.c_oflag||0;HEAP32[argp+8>>2]=termios.c_cflag||0;HEAP32[argp+12>>2]=termios.c_lflag||0;for(var i=0;i<32;i++){HEAP8[argp+i+17]=termios.c_cc[i]||0;}return 0}return 0}case 21510:case 21511:case 21512:{if(!stream.tty)return -59;return 0}case 21506:case 21507:case 21508:{if(!stream.tty)return -59;if(stream.tty.ops.ioctl_tcsets){var argp=syscallGetVarargP();var c_iflag=HEAP32[argp>>2];var c_oflag=HEAP32[argp+4>>2];var c_cflag=HEAP32[argp+8>>2];var c_lflag=HEAP32[argp+12>>2];var c_cc=[];for(var i=0;i<32;i++){c_cc.push(HEAP8[argp+i+17]);}return stream.tty.ops.ioctl_tcsets(stream.tty,op,{c_iflag,c_oflag,c_cflag,c_lflag,c_cc})}return 0}case 21519:{if(!stream.tty)return -59;var argp=syscallGetVarargP();HEAP32[argp>>2]=0;return 0}case 21520:{if(!stream.tty)return -59;return -28}case 21531:{var argp=syscallGetVarargP();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return -59;if(stream.tty.ops.ioctl_tiocgwinsz){var winsize=stream.tty.ops.ioctl_tiocgwinsz(stream.tty);var argp=syscallGetVarargP();HEAP16[argp>>1]=winsize[0];HEAP16[argp+2>>1]=winsize[1];}return 0}case 21524:{if(!stream.tty)return -59;return 0}case 21515:{if(!stream.tty)return -59;return 0}default:return -28}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function ___syscall_lstat64(path,buf){try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.lstat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function ___syscall_mkdirat(dirfd,path,mode){try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);FS.mkdir(path,mode,0);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function ___syscall_newfstatat(dirfd,path,buf,flags){try{path=SYSCALLS.getStr(path);var nofollow=flags&256;var allowEmpty=flags&4096;flags=flags&~6400;path=SYSCALLS.calculateAt(dirfd,path,allowEmpty);return SYSCALLS.writeStat(buf,nofollow?FS.lstat(path):FS.stat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?syscallGetVarargI():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function ___syscall_stat64(path,buf){try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.stat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}var __abort_js=()=>abort("");var embindRepr=v=>{if(v===null){return "null"}var t=typeof v;if(t==="object"||t==="array"||t==="function"){return v.toString()}else {return ""+v}};var embind_init_charCodes=()=>{var codes=new Array(256);for(var i=0;i<256;++i){codes[i]=String.fromCharCode(i);}embind_charCodes=codes;};var embind_charCodes;var readLatin1String=ptr=>{var ret="";var c=ptr;while(HEAPU8[c]){ret+=embind_charCodes[HEAPU8[c++]];}return ret};var awaitingDependencies={};var registeredTypes={};var typeDependencies={};var BindingError=Module["BindingError"]=class BindingError extends Error{constructor(message){super(message);this.name="BindingError";}};var throwBindingError=message=>{throw new BindingError(message)};function sharedRegisterType(rawType,registeredInstance,options={}){var name=registeredInstance.name;if(!rawType){throwBindingError(`type "${name}" must have a positive integer typeid pointer`);}if(registeredTypes.hasOwnProperty(rawType)){if(options.ignoreDuplicateRegistrations){return}else {throwBindingError(`Cannot register type '${name}' twice`);}}registeredTypes[rawType]=registeredInstance;delete typeDependencies[rawType];if(awaitingDependencies.hasOwnProperty(rawType)){var callbacks=awaitingDependencies[rawType];delete awaitingDependencies[rawType];callbacks.forEach(cb=>cb());}}function registerType(rawType,registeredInstance,options={}){return sharedRegisterType(rawType,registeredInstance,options)}var integerReadValueFromPointer=(name,width,signed)=>{switch(width){case 1:return signed?pointer=>HEAP8[pointer]:pointer=>HEAPU8[pointer];case 2:return signed?pointer=>HEAP16[pointer>>1]:pointer=>HEAPU16[pointer>>1];case 4:return signed?pointer=>HEAP32[pointer>>2]:pointer=>HEAPU32[pointer>>2];case 8:return signed?pointer=>HEAP64[pointer>>3]:pointer=>HEAPU64[pointer>>3];default:throw new TypeError(`invalid integer width (${width}): ${name}`)}};var __embind_register_bigint=(primitiveType,name,size,minRange,maxRange)=>{name=readLatin1String(name);var isUnsignedType=name.indexOf("u")!=-1;registerType(primitiveType,{name,fromWireType:value=>value,toWireType:function(destructors,value){if(typeof value!="bigint"&&typeof value!="number"){throw new TypeError(`Cannot convert "${embindRepr(value)}" to ${this.name}`)}if(typeof value=="number"){value=BigInt(value);}return value},argPackAdvance:GenericWireTypeSize,readValueFromPointer:integerReadValueFromPointer(name,size,!isUnsignedType),destructorFunction:null});};var GenericWireTypeSize=8;var __embind_register_bool=(rawType,name,trueValue,falseValue)=>{name=readLatin1String(name);registerType(rawType,{name,fromWireType:function(wt){return !!wt},toWireType:function(destructors,o){return o?trueValue:falseValue},argPackAdvance:GenericWireTypeSize,readValueFromPointer:function(pointer){return this["fromWireType"](HEAPU8[pointer])},destructorFunction:null});};var emval_freelist=[];var emval_handles=[];var __emval_decref=handle=>{if(handle>9&&0===--emval_handles[handle+1]){emval_handles[handle]=undefined;emval_freelist.push(handle);}};var count_emval_handles=()=>emval_handles.length/2-5-emval_freelist.length;var init_emval=()=>{emval_handles.push(0,1,undefined,1,null,1,true,1,false,1);Module["count_emval_handles"]=count_emval_handles;};var Emval={toValue:handle=>{if(!handle){throwBindingError(`Cannot use deleted val. handle = ${handle}`);}return emval_handles[handle]},toHandle:value=>{switch(value){case undefined:return 2;case null:return 4;case true:return 6;case false:return 8;default:{const handle=emval_freelist.pop()||emval_handles.length;emval_handles[handle]=value;emval_handles[handle+1]=1;return handle}}}};function readPointer(pointer){return this["fromWireType"](HEAPU32[pointer>>2])}var EmValType={name:"emscripten::val",fromWireType:handle=>{var rv=Emval.toValue(handle);__emval_decref(handle);return rv},toWireType:(destructors,value)=>Emval.toHandle(value),argPackAdvance:GenericWireTypeSize,readValueFromPointer:readPointer,destructorFunction:null};var __embind_register_emval=rawType=>registerType(rawType,EmValType);var floatReadValueFromPointer=(name,width)=>{switch(width){case 4:return function(pointer){return this["fromWireType"](HEAPF32[pointer>>2])};case 8:return function(pointer){return this["fromWireType"](HEAPF64[pointer>>3])};default:throw new TypeError(`invalid float width (${width}): ${name}`)}};var __embind_register_float=(rawType,name,size)=>{name=readLatin1String(name);registerType(rawType,{name,fromWireType:value=>value,toWireType:(destructors,value)=>value,argPackAdvance:GenericWireTypeSize,readValueFromPointer:floatReadValueFromPointer(name,size),destructorFunction:null});};var createNamedFunction=(name,func)=>Object.defineProperty(func,"name",{value:name});var runDestructors=destructors=>{while(destructors.length){var ptr=destructors.pop();var del=destructors.pop();del(ptr);}};function usesDestructorStack(argTypes){for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){return true}}return false}function createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync){var needsDestructorStack=usesDestructorStack(argTypes);var argCount=argTypes.length-2;var argsList=[];var argsListWired=["fn"];if(isClassMethodFunc){argsListWired.push("thisWired");}for(var i=0;i<argCount;++i){argsList.push(`arg${i}`);argsListWired.push(`arg${i}Wired`);}argsList=argsList.join(",");argsListWired=argsListWired.join(",");var invokerFnBody=`return function (${argsList}) {\n`;if(needsDestructorStack){invokerFnBody+="var destructors = [];\n";}var dtorStack=needsDestructorStack?"destructors":"null";var args1=["humanName","throwBindingError","invoker","fn","runDestructors","retType","classParam"];if(isClassMethodFunc){invokerFnBody+=`var thisWired = classParam['toWireType'](${dtorStack}, this);\n`;}for(var i=0;i<argCount;++i){invokerFnBody+=`var arg${i}Wired = argType${i}['toWireType'](${dtorStack}, arg${i});\n`;args1.push(`argType${i}`);}invokerFnBody+=(returns||isAsync?"var rv = ":"")+`invoker(${argsListWired});\n`;if(needsDestructorStack){invokerFnBody+="runDestructors(destructors);\n";}else {for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){var paramName=i===1?"thisWired":"arg"+(i-2)+"Wired";if(argTypes[i].destructorFunction!==null){invokerFnBody+=`${paramName}_dtor(${paramName});\n`;args1.push(`${paramName}_dtor`);}}}if(returns){invokerFnBody+="var ret = retType['fromWireType'](rv);\n"+"return ret;\n";}invokerFnBody+="}\n";return [args1,invokerFnBody]}function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=usesDestructorStack(argTypes);var returns=argTypes[0].name!=="void";var closureArgs=[humanName,throwBindingError,cppInvokerFunc,cppTargetFunc,runDestructors,argTypes[0],argTypes[1]];for(var i=0;i<argCount-2;++i){closureArgs.push(argTypes[i+2]);}if(!needsDestructorStack){for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){closureArgs.push(argTypes[i].destructorFunction);}}}let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);var invokerFn=new Function(...args,invokerFnBody)(...closureArgs);return createNamedFunction(humanName,invokerFn)}var ensureOverloadTable=(proto,methodName,humanName)=>{if(undefined===proto[methodName].overloadTable){var prevFunc=proto[methodName];proto[methodName]=function(...args){if(!proto[methodName].overloadTable.hasOwnProperty(args.length)){throwBindingError(`Function '${humanName}' called with an invalid number of arguments (${args.length}) - expects one of (${proto[methodName].overloadTable})!`);}return proto[methodName].overloadTable[args.length].apply(this,args)};proto[methodName].overloadTable=[];proto[methodName].overloadTable[prevFunc.argCount]=prevFunc;}};var exposePublicSymbol=(name,value,numArguments)=>{if(Module.hasOwnProperty(name)){if(undefined===numArguments||undefined!==Module[name].overloadTable&&undefined!==Module[name].overloadTable[numArguments]){throwBindingError(`Cannot register public name '${name}' twice`);}ensureOverloadTable(Module,name,name);if(Module[name].overloadTable.hasOwnProperty(numArguments)){throwBindingError(`Cannot register multiple overloads of a function with the same number of arguments (${numArguments})!`);}Module[name].overloadTable[numArguments]=value;}else {Module[name]=value;Module[name].argCount=numArguments;}};var heap32VectorToArray=(count,firstElement)=>{var array=[];for(var i=0;i<count;i++){array.push(HEAPU32[firstElement+i*4>>2]);}return array};var InternalError=Module["InternalError"]=class InternalError extends Error{constructor(message){super(message);this.name="InternalError";}};var throwInternalError=message=>{throw new InternalError(message)};var replacePublicSymbol=(name,value,numArguments)=>{if(!Module.hasOwnProperty(name)){throwInternalError("Replacing nonexistent public symbol");}if(undefined!==Module[name].overloadTable&&undefined!==numArguments){Module[name].overloadTable[numArguments]=value;}else {Module[name]=value;Module[name].argCount=numArguments;}};var wasmTableMirror=[];var wasmTable;var getWasmTableEntry=funcPtr=>{var func=wasmTableMirror[funcPtr];if(!func){wasmTableMirror[funcPtr]=func=wasmTable.get(funcPtr);}return func};var embind__requireFunction=(signature,rawFunction,isAsync=false)=>{signature=readLatin1String(signature);function makeDynCaller(){var rtn=getWasmTableEntry(rawFunction);return rtn}var fp=makeDynCaller();if(typeof fp!="function"){throwBindingError(`unknown function pointer with signature ${signature}: ${rawFunction}`);}return fp};class UnboundTypeError extends Error{}var getTypeName=type=>{var ptr=___getTypeName(type);var rv=readLatin1String(ptr);_free(ptr);return rv};var throwUnboundTypeError=(message,types)=>{var unboundTypes=[];var seen={};function visit(type){if(seen[type]){return}if(registeredTypes[type]){return}if(typeDependencies[type]){typeDependencies[type].forEach(visit);return}unboundTypes.push(type);seen[type]=true;}types.forEach(visit);throw new UnboundTypeError(`${message}: `+unboundTypes.map(getTypeName).join([", "]))};var whenDependentTypesAreResolved=(myTypes,dependentTypes,getTypeConverters)=>{myTypes.forEach(type=>typeDependencies[type]=dependentTypes);function onComplete(typeConverters){var myTypeConverters=getTypeConverters(typeConverters);if(myTypeConverters.length!==myTypes.length){throwInternalError("Mismatched type converter count");}for(var i=0;i<myTypes.length;++i){registerType(myTypes[i],myTypeConverters[i]);}}var typeConverters=new Array(dependentTypes.length);var unregisteredTypes=[];var registered=0;dependentTypes.forEach((dt,i)=>{if(registeredTypes.hasOwnProperty(dt)){typeConverters[i]=registeredTypes[dt];}else {unregisteredTypes.push(dt);if(!awaitingDependencies.hasOwnProperty(dt)){awaitingDependencies[dt]=[];}awaitingDependencies[dt].push(()=>{typeConverters[i]=registeredTypes[dt];++registered;if(registered===unregisteredTypes.length){onComplete(typeConverters);}});}});if(0===unregisteredTypes.length){onComplete(typeConverters);}};var getFunctionName=signature=>{signature=signature.trim();const argsIndex=signature.indexOf("(");if(argsIndex===-1)return signature;return signature.slice(0,argsIndex)};var __embind_register_function=(name,argCount,rawArgTypesAddr,signature,rawInvoker,fn,isAsync,isNonnullReturn)=>{var argTypes=heap32VectorToArray(argCount,rawArgTypesAddr);name=readLatin1String(name);name=getFunctionName(name);rawInvoker=embind__requireFunction(signature,rawInvoker,isAsync);exposePublicSymbol(name,function(){throwUnboundTypeError(`Cannot call ${name} due to unbound types`,argTypes);},argCount-1);whenDependentTypesAreResolved([],argTypes,argTypes=>{var invokerArgsArray=[argTypes[0],null].concat(argTypes.slice(1));replacePublicSymbol(name,craftInvokerFunction(name,invokerArgsArray,null,rawInvoker,fn,isAsync),argCount-1);return []});};var __embind_register_integer=(primitiveType,name,size,minRange,maxRange)=>{name=readLatin1String(name);var fromWireType=value=>value;if(minRange===0){var bitshift=32-8*size;fromWireType=value=>value<<bitshift>>>bitshift;}var isUnsignedType=name.includes("unsigned");var checkAssertions=(value,toTypeName)=>{};var toWireType;if(isUnsignedType){toWireType=function(destructors,value){checkAssertions(value,this.name);return value>>>0};}else {toWireType=function(destructors,value){checkAssertions(value,this.name);return value};}registerType(primitiveType,{name,fromWireType,toWireType,argPackAdvance:GenericWireTypeSize,readValueFromPointer:integerReadValueFromPointer(name,size,minRange!==0),destructorFunction:null});};var __embind_register_memory_view=(rawType,dataTypeIndex,name)=>{var typeMapping=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array];var TA=typeMapping[dataTypeIndex];function decodeMemoryView(handle){var size=HEAPU32[handle>>2];var data=HEAPU32[handle+4>>2];return new TA(HEAP8.buffer,data,size)}name=readLatin1String(name);registerType(rawType,{name,fromWireType:decodeMemoryView,argPackAdvance:GenericWireTypeSize,readValueFromPointer:decodeMemoryView},{ignoreDuplicateRegistrations:true});};var __embind_register_std_string=(rawType,name)=>{name=readLatin1String(name);registerType(rawType,{name,fromWireType(value){var length=HEAPU32[value>>2];var payload=value+4;var str;var i; {var decodeStartPtr=payload;for(var i=0;i<=length;++i){var currentBytePtr=payload+i;if(i==length||HEAPU8[currentBytePtr]==0){var maxRead=currentBytePtr-decodeStartPtr;var stringSegment=UTF8ToString(decodeStartPtr,maxRead);if(str===undefined){str=stringSegment;}else {str+=String.fromCharCode(0);str+=stringSegment;}decodeStartPtr=currentBytePtr+1;}}}_free(value);return str},toWireType(destructors,value){if(value instanceof ArrayBuffer){value=new Uint8Array(value);}var length;var valueIsOfTypeString=typeof value=="string";if(!(valueIsOfTypeString||ArrayBuffer.isView(value)&&value.BYTES_PER_ELEMENT==1)){throwBindingError("Cannot pass non-string to std::string");}if(valueIsOfTypeString){length=lengthBytesUTF8(value);}else {length=value.length;}var base=_malloc(4+length+1);var ptr=base+4;HEAPU32[base>>2]=length;if(valueIsOfTypeString){{stringToUTF8(value,ptr,length+1);}}else {HEAPU8.set(value,ptr);}if(destructors!==null){destructors.push(_free,base);}return base},argPackAdvance:GenericWireTypeSize,readValueFromPointer:readPointer,destructorFunction(ptr){_free(ptr);}});};var UTF16Decoder=typeof TextDecoder!="undefined"?new TextDecoder("utf-16le"):undefined;var UTF16ToString=(ptr,maxBytesToRead)=>{var endPtr=ptr;var idx=endPtr>>1;var maxIdx=idx+maxBytesToRead/2;while(!(idx>=maxIdx)&&HEAPU16[idx])++idx;endPtr=idx<<1;if(endPtr-ptr>32&&UTF16Decoder)return UTF16Decoder.decode(HEAPU8.subarray(ptr,endPtr));var str="";for(var i=0;!(i>=maxBytesToRead/2);++i){var codeUnit=HEAP16[ptr+i*2>>1];if(codeUnit==0)break;str+=String.fromCharCode(codeUnit);}return str};var stringToUTF16=(str,outPtr,maxBytesToWrite)=>{maxBytesToWrite??=2147483647;if(maxBytesToWrite<2)return 0;maxBytesToWrite-=2;var startPtr=outPtr;var numCharsToWrite=maxBytesToWrite<str.length*2?maxBytesToWrite/2:str.length;for(var i=0;i<numCharsToWrite;++i){var codeUnit=str.charCodeAt(i);HEAP16[outPtr>>1]=codeUnit;outPtr+=2;}HEAP16[outPtr>>1]=0;return outPtr-startPtr};var lengthBytesUTF16=str=>str.length*2;var UTF32ToString=(ptr,maxBytesToRead)=>{var i=0;var str="";while(!(i>=maxBytesToRead/4)){var utf32=HEAP32[ptr+i*4>>2];if(utf32==0)break;++i;if(utf32>=65536){var ch=utf32-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023);}else {str+=String.fromCharCode(utf32);}}return str};var stringToUTF32=(str,outPtr,maxBytesToWrite)=>{maxBytesToWrite??=2147483647;if(maxBytesToWrite<4)return 0;var startPtr=outPtr;var endPtr=startPtr+maxBytesToWrite-4;for(var i=0;i<str.length;++i){var codeUnit=str.charCodeAt(i);if(codeUnit>=55296&&codeUnit<=57343){var trailSurrogate=str.charCodeAt(++i);codeUnit=65536+((codeUnit&1023)<<10)|trailSurrogate&1023;}HEAP32[outPtr>>2]=codeUnit;outPtr+=4;if(outPtr+4>endPtr)break}HEAP32[outPtr>>2]=0;return outPtr-startPtr};var lengthBytesUTF32=str=>{var len=0;for(var i=0;i<str.length;++i){var codeUnit=str.charCodeAt(i);if(codeUnit>=55296&&codeUnit<=57343)++i;len+=4;}return len};var __embind_register_std_wstring=(rawType,charSize,name)=>{name=readLatin1String(name);var decodeString,encodeString,readCharAt,lengthBytesUTF;if(charSize===2){decodeString=UTF16ToString;encodeString=stringToUTF16;lengthBytesUTF=lengthBytesUTF16;readCharAt=pointer=>HEAPU16[pointer>>1];}else if(charSize===4){decodeString=UTF32ToString;encodeString=stringToUTF32;lengthBytesUTF=lengthBytesUTF32;readCharAt=pointer=>HEAPU32[pointer>>2];}registerType(rawType,{name,fromWireType:value=>{var length=HEAPU32[value>>2];var str;var decodeStartPtr=value+4;for(var i=0;i<=length;++i){var currentBytePtr=value+4+i*charSize;if(i==length||readCharAt(currentBytePtr)==0){var maxReadBytes=currentBytePtr-decodeStartPtr;var stringSegment=decodeString(decodeStartPtr,maxReadBytes);if(str===undefined){str=stringSegment;}else {str+=String.fromCharCode(0);str+=stringSegment;}decodeStartPtr=currentBytePtr+charSize;}}_free(value);return str},toWireType:(destructors,value)=>{if(!(typeof value=="string")){throwBindingError(`Cannot pass non-string to C++ string type ${name}`);}var length=lengthBytesUTF(value);var ptr=_malloc(4+length+charSize);HEAPU32[ptr>>2]=length/charSize;encodeString(value,ptr+4,length+charSize);if(destructors!==null){destructors.push(_free,ptr);}return ptr},argPackAdvance:GenericWireTypeSize,readValueFromPointer:readPointer,destructorFunction(ptr){_free(ptr);}});};var __embind_register_void=(rawType,name)=>{name=readLatin1String(name);registerType(rawType,{isVoid:true,name,argPackAdvance:0,fromWireType:()=>undefined,toWireType:(destructors,o)=>undefined});};var __emscripten_throw_longjmp=()=>{throw Infinity};var requireRegisteredType=(rawType,humanName)=>{var impl=registeredTypes[rawType];if(undefined===impl){throwBindingError(`${humanName} has unknown type ${getTypeName(rawType)}`);}return impl};var emval_returnValue=(returnType,destructorsRef,handle)=>{var destructors=[];var result=returnType["toWireType"](destructors,handle);if(destructors.length){HEAPU32[destructorsRef>>2]=Emval.toHandle(destructors);}return result};var __emval_as=(handle,returnType,destructorsRef)=>{handle=Emval.toValue(handle);returnType=requireRegisteredType(returnType,"emval::as");return emval_returnValue(returnType,destructorsRef,handle)};var emval_symbols={};var getStringOrSymbol=address=>{var symbol=emval_symbols[address];if(symbol===undefined){return readLatin1String(address)}return symbol};var emval_methodCallers=[];var __emval_call_method=(caller,objHandle,methodName,destructorsRef,args)=>{caller=emval_methodCallers[caller];objHandle=Emval.toValue(objHandle);methodName=getStringOrSymbol(methodName);return caller(objHandle,objHandle[methodName],destructorsRef,args)};var emval_get_global=()=>{if(typeof globalThis=="object"){return globalThis}return function(){return Function}()("return this")()};var __emval_get_global=name=>{if(name===0){return Emval.toHandle(emval_get_global())}else {name=getStringOrSymbol(name);return Emval.toHandle(emval_get_global()[name])}};var emval_addMethodCaller=caller=>{var id=emval_methodCallers.length;emval_methodCallers.push(caller);return id};var emval_lookupTypes=(argCount,argTypes)=>{var a=new Array(argCount);for(var i=0;i<argCount;++i){a[i]=requireRegisteredType(HEAPU32[argTypes+i*4>>2],`parameter ${i}`);}return a};var __emval_get_method_caller=(argCount,argTypes,kind)=>{var types=emval_lookupTypes(argCount,argTypes);var retType=types.shift();argCount--;var functionBody=`return function (obj, func, destructorsRef, args) {\n`;var offset=0;var argsList=[];if(kind===0){argsList.push("obj");}var params=["retType"];var args=[retType];for(var i=0;i<argCount;++i){argsList.push(`arg${i}`);params.push(`argType${i}`);args.push(types[i]);functionBody+=`  var arg${i} = argType${i}.readValueFromPointer(args${offset?"+"+offset:""});\n`;offset+=types[i].argPackAdvance;}var invoker=kind===1?"new func":"func.call";functionBody+=`  var rv = ${invoker}(${argsList.join(", ")});\n`;if(!retType.isVoid){params.push("emval_returnValue");args.push(emval_returnValue);functionBody+="  return emval_returnValue(retType, destructorsRef, rv);\n";}functionBody+="};\n";var invokerFunction=new Function(...params,functionBody)(...args);var functionName=`methodCaller<(${types.map(t=>t.name).join(", ")}) => ${retType.name}>`;return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};var __emval_get_property=(handle,key)=>{handle=Emval.toValue(handle);key=Emval.toValue(key);return Emval.toHandle(handle[key])};var __emval_incref=handle=>{if(handle>9){emval_handles[handle+1]+=1;}};var __emval_instanceof=(object,constructor)=>{object=Emval.toValue(object);constructor=Emval.toValue(constructor);return object instanceof constructor};var __emval_new_cstring=v=>Emval.toHandle(getStringOrSymbol(v));var __emval_run_destructors=handle=>{var destructors=Emval.toValue(handle);runDestructors(destructors);__emval_decref(handle);};var __emval_take_value=(type,arg)=>{type=requireRegisteredType(type,"_emval_take_value");var v=type["readValueFromPointer"](arg);return Emval.toHandle(v)};var isLeapYear=year=>year%4===0&&(year%100!==0||year%400===0);var MONTH_DAYS_LEAP_CUMULATIVE=[0,31,60,91,121,152,182,213,244,274,305,335];var MONTH_DAYS_REGULAR_CUMULATIVE=[0,31,59,90,120,151,181,212,243,273,304,334];var ydayFromDate=date=>{var leap=isLeapYear(date.getFullYear());var monthDaysCumulative=leap?MONTH_DAYS_LEAP_CUMULATIVE:MONTH_DAYS_REGULAR_CUMULATIVE;var yday=monthDaysCumulative[date.getMonth()]+date.getDate()-1;return yday};var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);function __localtime_js(time,tmPtr){time=bigintToI53Checked(time);var date=new Date(time*1e3);HEAP32[tmPtr>>2]=date.getSeconds();HEAP32[tmPtr+4>>2]=date.getMinutes();HEAP32[tmPtr+8>>2]=date.getHours();HEAP32[tmPtr+12>>2]=date.getDate();HEAP32[tmPtr+16>>2]=date.getMonth();HEAP32[tmPtr+20>>2]=date.getFullYear()-1900;HEAP32[tmPtr+24>>2]=date.getDay();var yday=ydayFromDate(date)|0;HEAP32[tmPtr+28>>2]=yday;HEAP32[tmPtr+36>>2]=-(date.getTimezoneOffset()*60);var start=new Date(date.getFullYear(),0,1);var summerOffset=new Date(date.getFullYear(),6,1).getTimezoneOffset();var winterOffset=start.getTimezoneOffset();var dst=(summerOffset!=winterOffset&&date.getTimezoneOffset()==Math.min(winterOffset,summerOffset))|0;HEAP32[tmPtr+32>>2]=dst;}function __mmap_js(len,prot,flags,fd,offset,allocated,addr){offset=bigintToI53Checked(offset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,offset,prot,flags);var ptr=res.ptr;HEAP32[allocated>>2]=res.allocated;HEAPU32[addr>>2]=ptr;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){offset=bigintToI53Checked(offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset);}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return -e.errno}}var __tzset_js=(timezone,daylight,std_name,dst_name)=>{var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);HEAPU32[timezone>>2]=stdTimezoneOffset*60;HEAP32[daylight>>2]=Number(winterOffset!=summerOffset);var extractZone=timezoneOffset=>{var sign=timezoneOffset>=0?"-":"+";var absOffset=Math.abs(timezoneOffset);var hours=String(Math.floor(absOffset/60)).padStart(2,"0");var minutes=String(absOffset%60).padStart(2,"0");return `UTC${sign}${hours}${minutes}`};var winterName=extractZone(winterOffset);var summerName=extractZone(summerOffset);if(summerOffset<winterOffset){stringToUTF8(winterName,std_name,17);stringToUTF8(summerName,dst_name,17);}else {stringToUTF8(winterName,dst_name,17);stringToUTF8(summerName,std_name,17);}};var _emscripten_get_now=()=>performance.now();var _emscripten_date_now=()=>Date.now();var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;function _clock_time_get(clk_id,ignored_precision,ptime){if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now();}else {now=_emscripten_get_now();}var nsec=Math.round(now*1e3*1e3);HEAP64[ptime>>3]=BigInt(nsec);return 0}var getHeapMax=()=>2147483648;var growMemory=size=>{var b=wasmMemory.buffer;var pages=(size-b.byteLength+65535)/65536|0;try{wasmMemory.grow(pages);updateMemoryViews();return 1}catch(e){}};var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}return false};var ENV={};var getExecutableName=()=>thisProgram||"./this.program";var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(typeof navigator=="object"&&navigator.languages&&navigator.languages[0]||"C").replace("-","_")+".UTF-8";var env={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x];}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`);}getEnvStrings.strings=strings;}return getEnvStrings.strings};var _environ_get=(__environ,environ_buf)=>{var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;HEAPU32[__environ+envp>>2]=ptr;bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=4;}return 0};var _environ_sizes_get=(penviron_count,penviron_buf_size)=>{var strings=getEnvStrings();HEAPU32[penviron_count>>2]=strings.length;var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1;}HEAPU32[penviron_buf_size>>2]=bufSize;return 0};function _fd_close(fd){try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doReadv=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=HEAPU32[iov>>2];var len=HEAPU32[iov+4>>2];iov+=8;var curr=FS.read(stream,HEAP8,ptr,len,offset);if(curr<0)return -1;ret+=curr;if(curr<len)break;if(typeof offset!="undefined"){offset+=curr;}}return ret};function _fd_read(fd,iov,iovcnt,pnum){try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);HEAPU32[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _fd_seek(fd,offset,whence,newOffset){offset=bigintToI53Checked(offset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);HEAP64[newOffset>>3]=BigInt(stream.position);if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doWritev=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=HEAPU32[iov>>2];var len=HEAPU32[iov+4>>2];iov+=8;var curr=FS.write(stream,HEAP8,ptr,len,offset);if(curr<0)return -1;ret+=curr;if(curr<len){break}if(typeof offset!="undefined"){offset+=curr;}}return ret};function _fd_write(fd,iov,iovcnt,pnum){try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);HEAPU32[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _random_get(buffer,size){try{randomFill(HEAPU8.subarray(buffer,buffer+size));return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var getCFunc=ident=>{var func=Module["_"+ident];return func};var writeArrayToMemory=(array,buffer)=>{HEAP8.set(array,buffer);};var stackAlloc=sz=>__emscripten_stack_alloc(sz);var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str);}return ret},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return ret}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(ret)}if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i]);}else {cArgs[i]=args[i];}}}var ret=func(...cArgs);function onDone(ret){if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}ret=onDone(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>{var numericArgs=!argTypes||argTypes.every(type=>type==="number"||type==="boolean");var numericRet=returnType!=="string";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return (...args)=>ccall(ident,returnType,argTypes,args)};var FS_createPath=FS.createPath;var FS_unlink=path=>FS.unlink(path);var FS_createLazyFile=FS.createLazyFile;var FS_createDevice=FS.createDevice;FS.createPreloadedFile=FS_createPreloadedFile;FS.staticInit();Module["FS_createPath"]=FS.createPath;Module["FS_createDataFile"]=FS.createDataFile;Module["FS_createPath"]=FS.createPath;Module["FS_createDataFile"]=FS.createDataFile;Module["FS_createPreloadedFile"]=FS.createPreloadedFile;Module["FS_unlink"]=FS.unlink;Module["FS_createLazyFile"]=FS.createLazyFile;Module["FS_createDevice"]=FS.createDevice;MEMFS.doesNotExistError=new FS.ErrnoError(44);MEMFS.doesNotExistError.stack="<generic error, no stack>";embind_init_charCodes();init_emval();{if(Module["noExitRuntime"])Module["noExitRuntime"];if(Module["preloadPlugins"])preloadPlugins=Module["preloadPlugins"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];if(Module["arguments"])Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];}Module["addRunDependency"]=addRunDependency;Module["removeRunDependency"]=removeRunDependency;Module["ccall"]=ccall;Module["cwrap"]=cwrap;Module["setValue"]=setValue;Module["getValue"]=getValue;Module["UTF8ToString"]=UTF8ToString;Module["stringToUTF8"]=stringToUTF8;Module["FS_createPreloadedFile"]=FS_createPreloadedFile;Module["FS_unlink"]=FS_unlink;Module["FS_createPath"]=FS_createPath;Module["FS_createDevice"]=FS_createDevice;Module["FS_createDataFile"]=FS_createDataFile;Module["FS_createLazyFile"]=FS_createLazyFile;var wasmImports={a:___cxa_throw,g:___syscall_fcntl64,J:___syscall_fstat64,v:___syscall_getdents64,K:___syscall_ioctl,G:___syscall_lstat64,u:___syscall_mkdirat,H:___syscall_newfstatat,m:___syscall_openat,I:___syscall_stat64,M:__abort_js,p:__embind_register_bigint,S:__embind_register_bool,P:__embind_register_emval,o:__embind_register_float,i:__embind_register_function,c:__embind_register_integer,b:__embind_register_memory_view,R:__embind_register_std_string,h:__embind_register_std_wstring,T:__embind_register_void,w:__emscripten_throw_longjmp,W:__emval_as,U:__emval_call_method,e:__emval_decref,Q:__emval_get_global,L:__emval_get_method_caller,X:__emval_get_property,s:__emval_incref,r:__emval_instanceof,q:__emval_new_cstring,j:__emval_run_destructors,V:__emval_take_value,B:__localtime_js,z:__mmap_js,A:__munmap_js,C:__tzset_js,y:_clock_time_get,n:_emscripten_date_now,d:_emscripten_get_now,x:_emscripten_resize_heap,E:_environ_get,F:_environ_sizes_get,f:_fd_close,k:_fd_read,D:_fd_seek,l:_fd_write,O:invoke_iii,N:invoke_iiiii,t:_random_get};var wasmExports=await createWasm();wasmExports["Z"];Module["_init"]=wasmExports["$"];Module["_version"]=wasmExports["aa"];Module["_layoutsAfterCommands"]=wasmExports["ba"];Module["_setLogLevel"]=wasmExports["ca"];Module["_load"]=wasmExports["da"];var _malloc=Module["_malloc"]=wasmExports["ea"];Module["_destroy"]=wasmExports["fa"];Module["_saveXml"]=wasmExports["ga"];Module["_saveMxl"]=wasmExports["ha"];Module["_saveSvg"]=wasmExports["ia"];Module["_selectNextChord"]=wasmExports["ja"];Module["_pitchUp"]=wasmExports["ka"];Module["_undo"]=wasmExports["la"];Module["_redo"]=wasmExports["ma"];Module["_title"]=wasmExports["na"];Module["_subtitle"]=wasmExports["oa"];Module["_setTitleText"]=wasmExports["pa"];Module["_setSubtitleText"]=wasmExports["qa"];Module["_setComposerText"]=wasmExports["ra"];Module["_setLyricistText"]=wasmExports["sa"];Module["_npages"]=wasmExports["ta"];Module["_saveMsc"]=wasmExports["ua"];Module["_selectPartMeasureByIndex"]=wasmExports["va"];Module["_clearSelection"]=wasmExports["wa"];Module["_selectAll"]=wasmExports["xa"];Module["_isSelectionRange"]=wasmExports["ya"];Module["_selectPrevChord"]=wasmExports["za"];Module["_extendSelectionNextChord"]=wasmExports["Aa"];Module["_extendSelectionPrevChord"]=wasmExports["Ba"];Module["_extendSelectionNextMeasure"]=wasmExports["Ca"];Module["_extendSelectionPrevMeasure"]=wasmExports["Da"];Module["_extendSelectionStaffAbove"]=wasmExports["Ea"];Module["_extendSelectionStaffBelow"]=wasmExports["Fa"];Module["_pitchDown"]=wasmExports["Ga"];Module["_deleteSelection"]=wasmExports["Ha"];Module["_getSpatium"]=wasmExports["Ia"];Module["_relayout"]=wasmExports["Ja"];Module["_getLayoutMode"]=wasmExports["Ka"];Module["_setLayoutMode"]=wasmExports["La"];Module["_getUndoInfo"]=wasmExports["Ma"];Module["_undoRedoTo"]=wasmExports["Na"];Module["_setAccidental"]=wasmExports["Oa"];Module["_doubleDuration"]=wasmExports["Pa"];Module["_halfDuration"]=wasmExports["Qa"];Module["_toggleDot"]=wasmExports["Ra"];Module["_toggleDoubleDot"]=wasmExports["Sa"];Module["_addDynamic"]=wasmExports["Ta"];Module["_addHairpin"]=wasmExports["Ua"];Module["_addFermata"]=wasmExports["Va"];Module["_addBreath"]=wasmExports["Wa"];Module["_addArpeggio"]=wasmExports["Xa"];Module["_addOttava"]=wasmExports["Ya"];Module["_addTrill"]=wasmExports["Za"];Module["_setNoteheadGroup"]=wasmExports["_a"];Module["_setBeamMode"]=wasmExports["$a"];Module["_setMultiMeasureRests"]=wasmExports["ab"];Module["_multiMeasureRestsEnabled"]=wasmExports["bb"];Module["_setSelectedText"]=wasmExports["cb"];Module["_addStaffText"]=wasmExports["db"];Module["_addSystemText"]=wasmExports["eb"];Module["_addExpressionText"]=wasmExports["fb"];Module["_addLyricText"]=wasmExports["gb"];Module["_addFingeringText"]=wasmExports["hb"];Module["_addLeftHandGuitarFingeringText"]=wasmExports["ib"];Module["_addRightHandGuitarFingeringText"]=wasmExports["jb"];Module["_addStringNumberText"]=wasmExports["kb"];Module["_addInstrumentChangeText"]=wasmExports["lb"];Module["_addStickingText"]=wasmExports["mb"];Module["_addHarmonyText"]=wasmExports["nb"];Module["_addFiguredBassText"]=wasmExports["ob"];Module["_setTimeSignature"]=wasmExports["pb"];Module["_setTimeSignatureWithType"]=wasmExports["qb"];Module["_setKeySignature"]=wasmExports["rb"];Module["_setClef"]=wasmExports["sb"];Module["_setHarmonyVoiceLiteral"]=wasmExports["tb"];Module["_setChordSymbolStylePreset"]=wasmExports["ub"];Module["_addRehearsalMark"]=wasmExports["vb"];Module["_addArticulation"]=wasmExports["wb"];Module["_addTempoText"]=wasmExports["xb"];Module["_getKeySignature"]=wasmExports["yb"];Module["_getSelectedElementProperties"]=wasmExports["zb"];Module["_setSelectedElementProperty"]=wasmExports["Ab"];Module["_getUndoEntries"]=wasmExports["Bb"];Module["_selectTextElementAtPoint"]=wasmExports["Cb"];Module["_selectElementAtPoint"]=wasmExports["Db"];Module["_selectMeasureAtPoint"]=wasmExports["Eb"];Module["_extendMeasureSelectionAtPoint"]=wasmExports["Fb"];Module["_convertRangeToListSelection"]=wasmExports["Gb"];Module["_selectElementAtPointWithMode"]=wasmExports["Hb"];Module["_selectionMimeType"]=wasmExports["Ib"];Module["_selectionMimeData"]=wasmExports["Jb"];Module["_pasteSelection"]=wasmExports["Kb"];Module["_getSelectionBoundingBox"]=wasmExports["Lb"];Module["_getSelectionBoundingBoxes"]=wasmExports["Mb"];Module["_staffSystemBands"]=wasmExports["Nb"];Module["_setDurationType"]=wasmExports["Ob"];Module["_setNoteEntryMode"]=wasmExports["Pb"];Module["_setInputStateFromSelection"]=wasmExports["Qb"];Module["_setInputAccidentalType"]=wasmExports["Rb"];Module["_setInputDurationType"]=wasmExports["Sb"];Module["_toggleInputDot"]=wasmExports["Tb"];Module["_putNote"]=wasmExports["Ub"];Module["_enterRest"]=wasmExports["Vb"];Module["_setVoice"]=wasmExports["Wb"];Module["_setNoteEntryMethod"]=wasmExports["Xb"];Module["_addPitchByStep"]=wasmExports["Yb"];Module["_getNoteInputCursorRect"]=wasmExports["Zb"];Module["_addNoteFromRest"]=wasmExports["_b"];Module["_flipStem"]=wasmExports["$b"];Module["_toggleLineBreak"]=wasmExports["ac"];Module["_togglePageBreak"]=wasmExports["bc"];Module["_changeSelectedElementsVoice"]=wasmExports["cc"];Module["_measureSignatureCount"]=wasmExports["dc"];Module["_measureSignatureAt"]=wasmExports["ec"];Module["_measureSignatures"]=wasmExports["fc"];Module["_irregularMeasures"]=wasmExports["gc"];Module["_measureLineBreaks"]=wasmExports["hc"];Module["_measureRangeForPage"]=wasmExports["ic"];Module["_selectionMeasureRange"]=wasmExports["jc"];Module["_toggleRepeatStart"]=wasmExports["kc"];Module["_toggleRepeatEnd"]=wasmExports["lc"];Module["_setRepeatCount"]=wasmExports["mc"];Module["_setBarLineType"]=wasmExports["nc"];Module["_addVolta"]=wasmExports["oc"];Module["_addMarker"]=wasmExports["pc"];Module["_addJump"]=wasmExports["qc"];Module["_addMeasureRepeat"]=wasmExports["rc"];Module["_insertMeasures"]=wasmExports["sc"];Module["_addPickupMeasure"]=wasmExports["tc"];Module["_removeTrailingEmptyMeasures"]=wasmExports["uc"];Module["_removeSelectedMeasures"]=wasmExports["vc"];Module["_setMeasureLengthToTimeSignature"]=wasmExports["wc"];Module["_setMeasureLineBreaks"]=wasmExports["xc"];Module["_setMeasureSpacer"]=wasmExports["yc"];Module["_getSystemLockState"]=wasmExports["zc"];Module["_setSystemLock"]=wasmExports["Ac"];Module["_moveSelectedMeasureToSystem"]=wasmExports["Bc"];Module["_playbackTimeline"]=wasmExports["Cc"];Module["_selectionPlaybackStartTime"]=wasmExports["Dc"];Module["_addSlur"]=wasmExports["Ec"];Module["_addTie"]=wasmExports["Fc"];Module["_addGraceNote"]=wasmExports["Gc"];Module["_addTuplet"]=wasmExports["Hc"];Module["_addTremolo"]=wasmExports["Ic"];Module["_addGlissando"]=wasmExports["Jc"];Module["_addPedal"]=wasmExports["Kc"];Module["_addSostenutoPedal"]=wasmExports["Lc"];Module["_addUnaCorda"]=wasmExports["Mc"];Module["_splitPedal"]=wasmExports["Nc"];Module["_addAmbitus"]=wasmExports["Oc"];Module["_explodeSelection"]=wasmExports["Pc"];Module["_implodeSelection"]=wasmExports["Qc"];Module["_regroupSelection"]=wasmExports["Rc"];Module["_resequenceRehearsalMarks"]=wasmExports["Sc"];Module["_getSelectedFretDiagram"]=wasmExports["Tc"];Module["_setSelectedFretDiagram"]=wasmExports["Uc"];Module["_addFretDiagram"]=wasmExports["Vc"];Module["_generateExcerpts"]=wasmExports["Wc"];Module["_appendPart"]=wasmExports["Xc"];Module["_appendPartByMusicXmlId"]=wasmExports["Yc"];Module["_removePart"]=wasmExports["Zc"];Module["_setPartVisible"]=wasmExports["_c"];Module["_listInstrumentTemplates"]=wasmExports["$c"];Module["_addFont"]=wasmExports["ad"];Module["_savePositions"]=wasmExports["bd"];Module["_saveMetadata"]=wasmExports["cd"];Module["_loadProfile"]=wasmExports["dd"];Module["_setSelectionFilter"]=wasmExports["ed"];Module["_savePng"]=wasmExports["fd"];Module["_transpose"]=wasmExports["gd"];Module["_layoutUntilPage"]=wasmExports["hd"];Module["_layoutUntilPageState"]=wasmExports["id"];Module["_beginElementDrag"]=wasmExports["jd"];Module["_updateElementDrag"]=wasmExports["kd"];Module["_applyDropAtPoint"]=wasmExports["ld"];Module["_endElementDrag"]=wasmExports["md"];Module["_beginGripEdit"]=wasmExports["nd"];Module["_dragGrip"]=wasmExports["od"];Module["_endGripEdit"]=wasmExports["pd"];Module["_saveMidi"]=wasmExports["qd"];Module["_saveAudio"]=wasmExports["rd"];Module["_synthAudio"]=wasmExports["sd"];Module["_synthAudioFromSelection"]=wasmExports["td"];Module["_synthAudioForMeasureRange"]=wasmExports["ud"];Module["_synthAudioSelectionPreview"]=wasmExports["vd"];Module["_processSynth"]=wasmExports["wd"];Module["_processSynthBatch"]=wasmExports["xd"];Module["_saveAudioForMeasureRange"]=wasmExports["yd"];var _free=Module["_free"]=wasmExports["zd"];Module["_savePdf"]=wasmExports["Ad"];Module["_missingResources"]=wasmExports["Bd"];Module["_resourceRoot"]=wasmExports["Cd"];Module["_writeResource"]=wasmExports["Dd"];Module["_resourcesAdded"]=wasmExports["Ed"];var ___getTypeName=wasmExports["Fd"];var _emscripten_builtin_memalign=wasmExports["Gd"];var _setThrew=wasmExports["Hd"];var __emscripten_stack_restore=wasmExports["Id"];var __emscripten_stack_alloc=wasmExports["Jd"];var _emscripten_stack_get_current=wasmExports["Kd"];function invoke_iii(index,a1,a2){var sp=stackSave();try{return getWasmTableEntry(index)(a1,a2)}catch(e){stackRestore(sp);if(e!==e+0)throw e;_setThrew(1,0);}}function invoke_iiiii(index,a1,a2,a3,a4){var sp=stackSave();try{return getWasmTableEntry(index)(a1,a2,a3,a4)}catch(e){stackRestore(sp);if(e!==e+0)throw e;_setThrew(1,0);}}function run(){if(runDependencies>0){dependenciesFulfilled=run;return}preRun();if(runDependencies>0){dependenciesFulfilled=run;return}function doRun(){Module["calledRun"]=true;if(ABORT)return;initRuntime();readyPromiseResolve(Module);Module["onRuntimeInitialized"]?.();postRun();}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun();},1);}else {doRun();}}function preInit(){if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].shift()();}}}preInit();run();moduleRtn=readyPromise;


    return moduleRtn;
  }
  );
  })();

  const IS_NODE = typeof process === 'object' && typeof process.versions === 'object' && typeof process.versions.node === 'string';

  const getSelfURL = () => {
      let url = "";  // transforms to "" in the generated bundle
      if (!url) {
          if (typeof document !== 'undefined') {
              url = document.currentScript && document.currentScript.src || document.baseURI;
          } else if (typeof location !== 'undefined') {
              url = location.href;
          }
      }
      return url
  };

  const moduleOptions = IS_NODE
      ? {
          resolveNodeAssetPath(pathOrName) {
              const { basename, join } = require('path');
              // As in the browser: the emsdk 2 glue (4.00) asks for webmscore.lib.js.mem, published as webmscore.lib.mem.wasm.
              // A webmscore.lib.js.mem left in public/ by an older build would otherwise be found first and is not this one.
              const requested = basename(pathOrName);
              const name = requested === 'webmscore.lib.js.mem' ? 'webmscore.lib.mem.wasm' : requested;
              const candidates = [];
              if (typeof __dirname === 'string' && __dirname.length > 0) {
                  candidates.push(join(__dirname, name));
                  candidates.push(join(__dirname, '..', name));
              }
              if (typeof process === 'object' && typeof process.cwd === 'function') {
                  const cwd = process.cwd();
                  candidates.push(join(cwd, 'webmscore-fork', 'web-public', name));
                  candidates.push(join(cwd, 'public', name));
              }
              candidates.push(pathOrName);
              return candidates
          },
          // The first candidate that exists: the emsdk 4 glue (4.7 engine) reads whatever path this returns, and the
          // first candidate (next to src/) is not where the package keeps its .wasm/.data
          locateFile(path) {
              const fs = require('fs');
              const candidates = this.resolveNodeAssetPath(path);
              return candidates.find(candidate => {
                  try { return fs.existsSync(candidate) } catch { return false }
              }) ?? candidates[0]
          },
          getPreloadedPackage(remotePackageName) {
              const fs = require('fs');
              let lastError = null;
              for (const candidate of this.resolveNodeAssetPath(remotePackageName)) {
                  try {
                      const buf = fs.readFileSync(candidate).buffer;
                      return buf
                  } catch (error) {
                      lastError = error;
                  }
              }
              throw lastError || new Error(`Unable to load ${remotePackageName}`)
          }
      }
      : {
          locateFile(path) {
              const baseUrl = typeof MSCORE_BASEURL == 'string'
                  ? MSCORE_BASEURL
                  : (typeof document !== 'undefined' ? document.baseURI : getSelfURL());
              if (path.endsWith('webmscore.lib.js.mem') || path.endsWith('webmscore.lib.mem.wasm')) {
                  return new URL('webmscore.lib.mem.wasm', baseUrl).href
              }
              if (path.endsWith('webmscore.lib.wasm') || path.endsWith('.wasm')) {
                  return new URL('webmscore.lib.wasm', baseUrl).href
              }
              if (path.endsWith('webmscore.lib.data') || path.endsWith('.data')) {
                  return new URL('webmscore.lib.data', baseUrl).href
              }
              // fix loading the preload pack in Browsers and WebWorkers
              const prefix = typeof MSCORE_SCRIPT_URL == 'string'
                  ? MSCORE_SCRIPT_URL  // to use like an environment variable
                  : getSelfURL();
              return new URL(path, prefix).href
          }
      };

  moduleOptions.getArguments = moduleOptions.getArguments || (() => ["-platform", "wasm"]);
  moduleOptions.arguments = moduleOptions.arguments || moduleOptions.getArguments();
  moduleOptions.ENV = moduleOptions.ENV || {};
  moduleOptions.ENV.QT_QPA_PLATFORM = moduleOptions.ENV.QT_QPA_PLATFORM || "wasm";
  // webmscore/libmscore is memory-hungry; start with a larger heap to avoid early OOM / resize issues.
  moduleOptions.INITIAL_MEMORY = moduleOptions.INITIAL_MEMORY || 536870912;
  moduleOptions.__cxa_atexit = moduleOptions.__cxa_atexit || function () { return 0 };
  moduleOptions.___cxa_atexit = moduleOptions.___cxa_atexit || moduleOptions.__cxa_atexit;

  /** @type {Record<string, any>} */
  let Module = moduleOptions;
  /** @type {Promise<any>} */
  const ModulePromise = Module$1(moduleOptions);

  /**
   * get the pointer to a js string, as utf-8 encoded char*
   * @param {string} str 
   * @returns {number}
   */
  const getStrPtr = (str) => {
      const maxSize = str.length * 4 + 1;
      const buf = Module._malloc(maxSize);
      Module.stringToUTF8(str, buf, maxSize);
      return buf
  };

  /**
   * get the pointer to a TypedArray, as char*
   * @typedef {Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array} TypedArray
   * @param {TypedArray} data 
   * @returns {number}
   */
  const getTypedArrayPtr = (data) => {
      const size = data.length * data.BYTES_PER_ELEMENT;
      const buf = Module._malloc(size);
      Module.HEAPU8.set(data, buf);
      return buf
  };

  class WasmRes {
      /**
       * Read responses from the wasm module
       * @param {number} ptr char* pointer to the responses data
       */
      constructor(ptr) {
          /** @type {number} */
          this._ptr = ptr;
          /** @type {number} */
          this._size = WasmRes._getUint32(this._sizePtr);
          this._checkRet();
      }

      /**
       * pointer to the error code
       * @private
       */
      get _retCodePtr() {
          return this._ptr
      }

      /**
       * pointer to the data size 
       * @private
       */
      get _sizePtr() {
          return this._retCodePtr + 4
      }

      /**
       * pointer to the data contents 
       * @private
       */
      get _dataPtr() {
          return this._sizePtr + 4
      }

      /**
       * @private 
       * throw error if not ok
       */
      _checkRet() {
          const retCode = WasmRes._getUint32(this._retCodePtr);
          if (retCode !== WasmError.CODE_OK) {
              // read the error message from data
              const retMsg = this.text();
              this.free();
              throw new WasmError(retCode, retMsg)
          }
      }

      /**
       * Read the data contents as Uint8Array
       * @returns {Uint8Array}
       */
      data() {
          return new Uint8Array( // make a copy
              Module.HEAPU8.subarray(this._dataPtr, this._dataPtr + this._size)
          )
      }

      /**
       * Read the data contents as UTF-8 string
       * @returns {string}
       */
      text() {
          return Module.UTF8ToString(this._dataPtr)
      }

      /**
       * Read the data contents as number
       * @returns {number}
       */
      number() {
          return WasmRes._getUint32(this._dataPtr)
      }

      free() {
          return freePtr(this._ptr)
      }

      /**
       * @private 
       * @param {number} ptr 
       * @returns {number}
       */
      static _getUint32(ptr) {
          const sizeData = new DataView(
              new Uint8Array(  // make a copy
                  Module.HEAPU8.subarray(ptr, ptr + 4)
              ).buffer
          );
          return sizeData.getUint32(0, true)
      }

      /**
       * @private 
       * @param {number} ptr 
       * @param {keyof WasmRes} method
       */
      static _readAndFree(ptr, method) {
          const res = new WasmRes(ptr);
          const s = res[method]();
          res.free();
          return s
      }

      /**
       * read wasm responses as Uint8Array  
       * @param {number} ptr 
       * @returns {Uint8Array}
       */
      static readData(ptr) {
          return WasmRes._readAndFree(ptr, 'data')
      }

      /**
       * read wasm responses as UTF-8 string 
       * @param {number} ptr 
       * @returns {string}
       */
      static readText(ptr) {
          return WasmRes._readAndFree(ptr, 'text')
      }

      /**
       * read wasm responses as number
       * @param {number} ptr 
       * @returns {number}
       */
      static readNum(ptr) {
          return WasmRes._readAndFree(ptr, 'number')
      }
  }

  /**
   * free a pointer
   * @param {number} bufPtr 
   */
  const freePtr = (bufPtr) => {
      Module._free(bufPtr);
  };

  /**
   * this promise is resolved when the runtime is fully initialized
   */
  const RuntimeInitialized = new Promise((resolve) => {
      ModulePromise.then((_Module) => {
          Module = _Module;
          Module.ccall('init');  // init libmscore
          resolve(undefined);
      });
  });

  class WasmError extends Error {
      /**
       * @param {number} errorCode 
       * @param {string} msg
       */
      constructor(errorCode, msg) {
          super();
          this.name = 'WasmError';
          this.errorCode = errorCode;
          this.errorName = msg;
          this.message = `WebMscore Err${this.errorName}`;
      }
  }

  /** @type {0} */
  WasmError.CODE_OK = 0;

  /** @see WebMscore.hasSoundfont */
  /** @see WebMscore.resourceBaseUrl */
  let _resourceBaseUrl = typeof MSCORE_RESOURCE_BASEURL === 'string' ? MSCORE_RESOURCE_BASEURL : undefined;
  /** @see WebMscore.fallbackFonts */
  const _fallbackFonts = {
      ja: 'fonts/fallback/NotoSansJP-Regular.otf',
      ko: 'fonts/fallback/NotoSansKR-Regular.otf',
      zh: 'fonts/fallback/NotoSansSC-Regular.otf',
  };
  /** Resource paths that could not be fetched (not retried) */
  const _unavailableResources = new Set();
  /** Fallback font ids already registered */
  const _loadedFallbacks = new Set();
  let _hasSoundfont = false;
  const _utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  /**
   * Don't turn off logs if already set log level before `WebMscore.load(...)` is called
   * @see WebMscore.setLogLevel
   */
  let _hasLogLevelSet = false;

  class WebMscore {

      /**
       * This promise is resolved when the runtime is fully initialized
       * @returns {Promise<void>}
       */
      static get ready() {
          return RuntimeInitialized
      }

      /**
       * The maximum MSCZ/MSCX file format version supported by webmscore 
       * @returns {Promise<number>} e.g. `301`
       */
      static async version() {
          await WebMscore.ready;
          return Module.ccall('version', 'number')
      }

      /**
       * Set log level
       * @param {0 | 1 | 2} level - See https://github.com/LibreScore/webmscore/blob/v1.0.0/src/framework/global/thirdparty/haw_logger/logger/log_base.h#L30-L33
       *  - 0: Off
       *  - 1: Normal (`ERRR` or `WARN` or `INFO`)
       *  - 2: Debug  (`DEBG`)
       * @returns {Promise<void>}
       */
      static async setLogLevel(level) {
          _hasLogLevelSet = true;
          await WebMscore.ready;
          return Module.ccall('setLogLevel', null, ['number'], [level])
      }

      /**
       * Set custom stdout instead of `console.log`  
       * Available before `WebMscore.ready`
       * @private Node.js exclusive
       * @param {(byte: number) => any} write
       */
      static set stdout(write) {
          Module.stdout = write;
      }
      /** @private */
      static get stdout() {
          return Module.stdout
      }

      /**
       * Set custom stderr instead of `console.warn`  
       * Available before `WebMscore.ready`
       * @private Node.js exclusive
       * @param {(byte: number) => any} write
       * @example
       * ```js
       * WebMscore['stderr'] = function (byte) {
       *     process.stderr.write(new Uint8Array([byte]))
       * }
       * await WebMscore.ready
       * ```
       */
      static set stderr(write) {
          Module.stderr = write;
      }
      /** @private */
      static get stderr() {
          return Module.stderr
      }

      /**
       * Load score data
       * @param {import('../schemas').InputFileFormat} format 
       * @param {Uint8Array} data 
       * @param {Uint8Array[] | Promise<Uint8Array[]>} fonts load extra font files (CJK characters support)
       * @param {boolean} doLayout set to false if you only need the score metadata or the midi file (Super Fast, 3x faster than the musescore software)
       * @returns {Promise<WebMscore>}
       */
      static async load(format, data, fonts = [], doLayout = true) {
          const [_fonts] = await Promise.all([
              fonts,
              WebMscore.ready
          ]);

          for (const f of _fonts) {
              await WebMscore.addFont(f);
          }

          const fileformatptr = getStrPtr(format);
          const dataptr = getTypedArrayPtr(data);

          // get the pointer to the MasterScore class instance in C
          const resptr = Module.ccall('load',  // name of C function
              'number',  // return type
              ['number', 'number', 'number', 'boolean'],  // argument types
              [fileformatptr, dataptr, data.byteLength, doLayout]  // arguments
          );
          freePtr(fileformatptr);
          freePtr(dataptr);
          const scoreptr = WasmRes.readNum(resptr);

          if (!_hasLogLevelSet) {
              // turn off logs by default
              await WebMscore.setLogLevel(0);
          }

          const mscore = new WebMscore(scoreptr);
          if (doLayout) {
              await WebMscore._loadMissingResources(mscore);
          }
          return mscore
      }

      /**
       * Base URL of the engine resources fetched on demand (music fonts outside the preloaded set, CJK fallback fonts).
       * Only engines that report missing resources (the MuseScore 4.7 engine) use it.
       * @type {string | undefined}
       */
      static get resourceBaseUrl() {
          return _resourceBaseUrl
      }
      static set resourceBaseUrl(url) {
          _resourceBaseUrl = url;
      }

      /**
       * Fallback font files by script id, relative to `resourceBaseUrl`
       * @type {Record<string, string>}
       */
      static get fallbackFonts() {
          return _fallbackFonts
      }

      /**
       * Fetch one resource; override to serve resources another way (tests, offline bundles)
       * @param {string} path - relative to `resourceBaseUrl`
       * @returns {Promise<Uint8Array | null>} null when unavailable
       */
      static async fetchResource(path) {
          if (!WebMscore.resourceBaseUrl) {
              return null
          }
          try {
              const response = await fetch(new URL(path, WebMscore.resourceBaseUrl));
              return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
          } catch {
              return null
          }
      }

      /**
       * Fetch the fonts a freshly laid-out score asked for but the engine lacks, then lay it out again.
       * A no-op on engines without `missingResources` (the 4.00 engine bundles everything).
       * @private
       * @param {WebMscore} score
       */
      static async _loadMissingResources(score) {
          if (typeof Module['_missingResources'] !== 'function') {
              return
          }
          const root = WasmRes.readText(Module.ccall('resourceRoot', 'number', [], []));
          const write = (path, data) => {
              const pathptr = getStrPtr(path);
              const dataptr = getTypedArrayPtr(data);
              const ok = Module.ccall('writeResource', 'boolean', ['number', 'number', 'number'], [pathptr, dataptr, data.byteLength]);
              freePtr(pathptr);
              freePtr(dataptr);
              if (!ok) {
                  _unavailableResources.add(path);
              }
              return ok
          };
          // A newly loaded font can need another (a music font's text companion), so allow a few rounds
          for (let round = 0; round < 3; round++) {
              const wanted = JSON.parse(WasmRes.readText(Module.ccall('missingResources', 'number', ['number', 'number'], [score.scoreptr, score.excerptId])));
              let added = false;
              for (const path of wanted.files) {
                  if (_unavailableResources.has(path)) continue
                  const data = await WebMscore.fetchResource(path);
                  if (!data) {
                      _unavailableResources.add(path);
                      continue
                  }
                  added = write(path, data) || added;
              }
              for (const id of wanted.fallbacks) {
                  const path = WebMscore.fallbackFonts[id];
                  if (!path || _loadedFallbacks.has(id) || _unavailableResources.has(path)) continue
                  const data = await WebMscore.fetchResource(path);
                  if (!data) {
                      _unavailableResources.add(path);
                      continue
                  }
                  if (!write(path, data)) continue
                  _loadedFallbacks.add(id);
                  added = (await WebMscore.addFont(`${root}/${path}`)) || added;
              }
              if (!added) {
                  break
              }
              Module.ccall('resourcesAdded', 'number', [], []);
          }
      }

      /**
       * Load (CJK) fonts on demand
       * @private
       * @param {string | Uint8Array} font
       *        * path to the font file in the virtual file system, or
       *        * the font file data
       * @returns {Promise<boolean>} success
       */
      static async addFont(font) {
          if (typeof font !== 'string') {
              const name = '' + Math.random();  // a random name
              // save the font data to the virtual file system
              Module['FS_createDataFile']('/fonts/', name, font, true, true);
              font = '/fonts/' + name;
          }

          const fontpathptr = getStrPtr(font);
          const success = Module.ccall('addFont', 'number', ['number'], [fontpathptr]);
          freePtr(fontpathptr);
          return !!success
      }

      /**
       * A soundfont file is loaded  
       * @private
       * @type {boolean}
       * @see setSoundFont and saveAudio
       */
      static get hasSoundfont() {
          return _hasSoundfont
      }
      /** @private */
      static set hasSoundfont(value) {
          _hasSoundfont = value;
      }

      /**
       * Set the soundfont (sf2/sf3) data  
       * (Audio needs soundfonts)
       * @private
       * @param {Uint8Array} data 
       * @returns {Promise<void>}
       */
      static async setSoundFont(data) {
          if (WebMscore.hasSoundfont) {
              // remove the old soundfont file
              Module['FS_unlink']('/MuseScore_General.sf3');
          }

          // put the soundfont file into the virtual file system
          // side effects: the soundfont is shared across all instances
          Module['FS_createDataFile']('/', 'MuseScore_General.sf3', data, true, true);

          WebMscore.hasSoundfont = true;
      }

      /**
       * @hideconstructor use `WebMscore.load`
       * @param {number} scoreptr the pointer to the MasterScore class instance in C++
       */
      constructor(scoreptr) {
          /** @private */
          this.scoreptr = scoreptr;

          /** @private */
          this.excerptId = -1;
          if (!Module._getSystemLockState || !Module._setSystemLock || !Module._moveSelectedMeasureToSystem) {
              for (const name of ['getSystemLockState', 'setSystemLock', 'moveSelectedMeasureToSystem']) {
                  Object.defineProperty(this, name, { value: undefined });
              }
          }
      }

      /**
       * Only save this excerpt (linked parts) of the score  
       * 
       * if no excerpts, generate excerpts from existing instrument parts
       * 
       * @param {number} id  `-1` means the full score 
       */
      async setExcerptId(id) {
          this.excerptId = id;
      }

      async getExcerptId() {
          return this.excerptId
      }

      /**
       * Generate excerpts from Parts (only parts that are visible) if no existing excerpts
       * @returns {Promise<void>}
       */
      async generateExcerpts() {
          return Module.ccall('generateExcerpts', null, ['number'], [this.scoreptr])
      }

      /**
       * Get the score title
       * @returns {Promise<string>}
       */
      async title() {
          const dataptr = Module.ccall('title', 'number', ['number'], [this.scoreptr]);
          return WasmRes.readText(dataptr)
      }

      /**
       * Get the score subtitle
       * @returns {Promise<string>}
       */
      async subtitle() {
          const dataptr = Module.ccall('subtitle', 'number', ['number'], [this.scoreptr]);
          return WasmRes.readText(dataptr)
      }

      /**
       * Get the score title (filename safe, replaced some characters)
       */
      async titleFilenameSafe() {
          const title = await this.title();
          return title.replace(/[\s<>:{}"/\\|?*~.\0\cA-\cZ]+/g, '_')
      }

      /**
       * Set the score title in the first title frame (VBox)
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async setTitleText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('setTitleText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Set the score subtitle in the first title frame (VBox)
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async setSubtitleText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('setSubtitleText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Set the score composer in the first title frame (VBox)
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async setComposerText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('setComposerText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Set the lyricist text in the title frame
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async setLyricistText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('setLyricistText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      async setSelectedText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('setSelectedText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      // Returning null also lets worker-helper hide these methods when a new JS
      // package is paired with an older native engine. Do not infer from version().
      /**
       * Whether every mutating export leaves the score fully laid out, so an editor need not call
       * `relayout()` after an edit. A capability of the native engine (an export, not `version()`):
       * false on engines without it, which need the full relayout after edits their range layout misses.
       * @returns {Promise<boolean>}
       */
      async layoutsAfterCommands() {
          if (!Module._layoutsAfterCommands) return false
          return Module.ccall('layoutsAfterCommands', 'number', [], []) === 1
      }

      async getSystemLockState() {
          if (!Module._getSystemLockState || !Module._setSystemLock || !Module._moveSelectedMeasureToSystem) return null
          const ptr = Module.ccall('getSystemLockState', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return JSON.parse(WasmRes.readText(ptr))
      }

      async setSystemLock(locked) {
          if (typeof locked !== 'boolean' || !Module._setSystemLock) return false
          return Module.ccall('setSystemLock', 'boolean', ['number', 'number', 'number'], [this.scoreptr, Number(locked), this.excerptId])
      }

      async moveSelectedMeasureToSystem(direction) {
          if (!Module._moveSelectedMeasureToSystem || (direction !== 'previous' && direction !== 'next')) return false
          return Module.ccall('moveSelectedMeasureToSystem', 'boolean', ['number', 'number', 'number'], [this.scoreptr, direction === 'previous' ? -1 : 1, this.excerptId])
      }

      async getSelectedElementProperties() {
          const dataptr = Module.ccall('getSelectedElementProperties', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      async setSelectedElementProperty(propertyName, value) {
          const nameptr = getStrPtr(String(propertyName));
          const valueptr = getStrPtr(String(value));
          try {
              return Module.ccall('setSelectedElementProperty', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, nameptr, valueptr, this.excerptId])
          } finally {
              freePtr(nameptr);
              freePtr(valueptr);
          }
      }

      async addFretDiagram(pattern) {
          const patternptr = getStrPtr(String(pattern));
          try {
              return Module.ccall('addFretDiagram', 'boolean', ['number', 'number', 'number'], [this.scoreptr, patternptr, this.excerptId])
          } finally {
              freePtr(patternptr);
          }
      }

      async getSelectedFretDiagram() {
          const dataptr = Module.ccall('getSelectedFretDiagram', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      async setSelectedFretDiagram(diagram) {
          const dataptr = getStrPtr(JSON.stringify(diagram));
          try {
              return Module.ccall('setSelectedFretDiagram', 'boolean', ['number', 'number', 'number'], [this.scoreptr, dataptr, this.excerptId])
          } finally {
              freePtr(dataptr);
          }
      }

      async addAmbitus() {
          return Module.ccall('addAmbitus', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      async explodeSelection() {
          return Module.ccall('explodeSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      async implodeSelection() {
          return Module.ccall('implodeSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      async regroupSelection() {
          return Module.ccall('regroupSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      async resequenceRehearsalMarks() {
          return Module.ccall('resequenceRehearsalMarks', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Append a new part using an instrument template id
       * @param {string} instrumentId
       * @returns {Promise<boolean>}
       */
      async appendPart(instrumentId) {
          const strptr = getStrPtr(instrumentId == null ? '' : String(instrumentId));
          try {
              return Module.ccall('appendPart', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Append a new part using a MusicXML instrument id
       * @param {string} instrumentMusicXmlId
       * @returns {Promise<boolean>}
       */
      async appendPartByMusicXmlId(instrumentMusicXmlId) {
          const strptr = getStrPtr(instrumentMusicXmlId == null ? '' : String(instrumentMusicXmlId));
          try {
              return Module.ccall('appendPartByMusicXmlId', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Remove a part by index
       * @param {number} partIndex
       * @returns {Promise<boolean>}
       */
      async removePart(partIndex) {
          return Module.ccall('removePart', 'boolean', ['number', 'number', 'number'], [this.scoreptr, partIndex, this.excerptId])
      }

      /**
       * Toggle part visibility by index
       * @param {number} partIndex
       * @param {boolean} visible
       * @returns {Promise<boolean>}
       */
      async setPartVisible(partIndex, visible) {
          return Module.ccall('setPartVisible', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, partIndex, visible ? 1 : 0, this.excerptId])
      }

      /**
       * List available instrument templates
       * @returns {Promise<Array<{ id: string, name: string, groupId?: string, groupName?: string, familyId?: string, familyName?: string, staffCount?: number, isExtended?: boolean, instruments?: any[] }>>}
       */
      async listInstrumentTemplates() {
          const dataptr = Module.ccall('listInstrumentTemplates', 'number', ['number'], [this.scoreptr]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * Get the number of pages in the score (or the excerpt if `excerptId` is set)
       * @returns {Promise<number>}
       */
      async npages() {
          const dataptr = Module.ccall('npages', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return WasmRes.readNum(dataptr)
      }

      /**
       * Get the number of measures in a part (measure index basis for signatures).
       * @param {number} partIndex
       * @returns {Promise<number>}
       */
      async measureSignatureCount(partIndex) {
          const dataptr = Module.ccall('measureSignatureCount', 'number', ['number', 'number', 'number'], [this.scoreptr, partIndex, this.excerptId]);
          return WasmRes.readNum(dataptr)
      }

      /**
       * Get a compact signature string for a specific part measure.
       * @param {number} partIndex
       * @param {number} measureIndex
       * @returns {Promise<string>}
       */
      async measureSignatureAt(partIndex, measureIndex) {
          const dataptr = Module.ccall(
              'measureSignatureAt',
              'number',
              ['number', 'number', 'number', 'number'],
              [this.scoreptr, partIndex, measureIndex, this.excerptId]
          );
          return WasmRes.readText(dataptr)
      }

      /**
       * Get all measure signatures for a part.
       * @param {number} partIndex
       * @returns {Promise<string[]>}
       */
      async measureSignatures(partIndex) {
          const dataptr = Module.ccall('measureSignatures', 'number', ['number', 'number', 'number'], [this.scoreptr, partIndex, this.excerptId]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * Get line break flags for each measure in the score.
       * @returns {Promise<boolean[]>}
       */
      /**
       * Measures whose actual length differs from their time signature.
       *
       * MuseScore marks these with a small plus in the corner; this says what the
       * two lengths are, which the mark alone does not.
       * @returns {Promise<Array<{ index: number; number: string; actual: string; nominal: string; irregular: boolean }>>}
       */
      async irregularMeasures() {
          const dataptr = Module.ccall('irregularMeasures',
              'number',
              ['number', 'number'],
              [this.scoreptr, this.excerptId]
          );
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * Make one measure as long as its time signature says it is.
       *
       * The same operation as setting the actual duration back to the nominal one
       * in Measure Properties.
       * @param {number} measureIndex
       * @returns {Promise<boolean>}
       */
      async setMeasureLengthToTimeSignature(measureIndex) {
          return !!Module.ccall('setMeasureLengthToTimeSignature',
              'boolean',
              ['number', 'number', 'number'],
              [this.scoreptr, measureIndex, this.excerptId]
          )
      }

      async measureLineBreaks() {
          const dataptr = Module.ccall('measureLineBreaks', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * Set line break flags for each measure in the score.
       * @param {boolean[]} breaks
       * @returns {Promise<boolean>}
       */
      async setMeasureLineBreaks(breaks) {
          const payload = JSON.stringify(Array.isArray(breaks) ? breaks : []);
          const payloadPtr = getStrPtr(payload);
          const result = Module.ccall(
              'setMeasureLineBreaks',
              'boolean',
              ['number', 'number', 'number', 'number'],
              [this.scoreptr, payloadPtr, payload.length, this.excerptId]
          );
          freePtr(payloadPtr);
          return result
      }

      /**
       * Get score metadata
       * @returns {Promise<import('../schemas').ScoreMetadata>}
       */
      async metadata() {
          return JSON.parse(await this.saveMetadata())
      }

      /**
       * Get the positions of measures
       * @returns {Promise<import('../schemas').Positions>}
       */
      async measurePositions() {
          return JSON.parse(await this.savePositions(false))
      }

      /**
       * Resolve the inclusive measure range rendered on a page.
       * @param {number} pageIndex zero-based page index
       * @returns {Promise<{startMeasureIndex: number, endMeasureIndex: number} | null>}
       */
      async measureRangeForPage(pageIndex) {
          const dataptr = Module.ccall('measureRangeForPage',
              'number',
              ['number', 'number', 'number'],
              [this.scoreptr, pageIndex, this.excerptId]
          );
          const json = WasmRes.readText(dataptr);
          if (!json || json === 'null') {
              return null
          }
          return JSON.parse(json)
      }

      /**
       * Return the repeat-expanded, tempo-aware measure occurrence timeline.
       * @returns {Promise<import('../schemas').PlaybackTimeline | null>}
       */
      async playbackTimeline() {
          const dataptr = Module.ccall('playbackTimeline',
              'number',
              ['number', 'number'],
              [this.scoreptr, this.excerptId]
          );
          const json = WasmRes.readText(dataptr);
          if (!json || json === 'null') {
              return null
          }
          return JSON.parse(json)
      }

      /**
       * Resolve the inclusive measure range covered by the current selection.
       * @returns {Promise<{startMeasureIndex: number, endMeasureIndex: number} | null>}
       */
      async selectionMeasureRange() {
          const dataptr = Module.ccall('selectionMeasureRange',
              'number',
              ['number', 'number'],
              [this.scoreptr, this.excerptId]
          );
          const json = WasmRes.readText(dataptr);
          if (!json || json === 'null') {
              return null
          }
          return JSON.parse(json)
      }

      /**
       * Get the positions of segments
       * @returns {Promise<import('../schemas').Positions>}
       */
      async segmentPositions() {
          return JSON.parse(await this.savePositions(true))
      }

      /**
       * Export score as MusicXML file
       * @returns {Promise<string>} contents of the MusicXML file (plain text)
       */
      async saveXml() {
          const dataptr = Module.ccall('saveXml', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return WasmRes.readText(dataptr)
      }

      /**
       * Export score as compressed MusicXML file
       * @returns {Promise<Uint8Array>}
       */
      async saveMxl() {
          const dataptr = Module.ccall('saveMxl', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return WasmRes.readData(dataptr)
      }

      /**
       * Save part score as MSCZ/MSCX file
       * @param {'mscz' | 'mscx'} format 
       * @returns {Promise<Uint8Array>}
       */
      async saveMsc(format = 'mscz') {
          const dataptr = Module.ccall('saveMsc', 'number', ['number', 'boolean', 'number'], [this.scoreptr, format == 'mscz', this.excerptId]);
          return WasmRes.readData(dataptr)
      }

      /**
       * Export score as the SVG file of one page
       * @param {number} pageNumber integer
       * @param {boolean} drawPageBackground
       * @param {boolean} highlightSelection - if true, selected elements will be rendered with selection color
       * @returns {Promise<Uint8Array>} UTF-8 SVG bytes
       */
      async saveSvgRaw(pageNumber = 0, drawPageBackground = false, highlightSelection = false) {
          const dataptr = Module.ccall('saveSvg',
              'number',
              ['number', 'number', 'boolean', 'boolean', 'number'],
              [this.scoreptr, pageNumber, drawPageBackground, highlightSelection, this.excerptId]
          );
          return WasmRes.readData(dataptr)
      }

      /**
       * Export score as the SVG file of one page
       * @param {number} pageNumber integer
       * @param {boolean} drawPageBackground
       * @param {boolean} highlightSelection - if true, selected elements will be rendered with selection color
       * @returns {Promise<string>} contents of the SVG file (plain text)
       */
      async saveSvg(pageNumber = 0, drawPageBackground = false, highlightSelection = false) {
          const svgBytes = await this.saveSvgRaw(pageNumber, drawPageBackground, highlightSelection);
          if (_utf8Decoder) {
              return _utf8Decoder.decode(svgBytes)
          }
          // TextDecoder should exist in browser/worker runtimes, but keep a fallback for safety.
          let text = '';
          for (let i = 0; i < svgBytes.length; i += 1) {
              text += String.fromCharCode(svgBytes[i]);
          }
          return decodeURIComponent(escape(text))
      }

      /**
       * Export score as the PNG file of one page
       * @param {number} pageNumber integer
       * @param {boolean} drawPageBackground 
       * @param {boolean} transparent
       * @returns {Promise<Uint8Array>}
       */
      async savePng(pageNumber = 0, drawPageBackground = false, transparent = true) {
          const dataptr = Module.ccall('savePng',
              'number',
              ['number', 'number', 'boolean', 'boolean', 'number'],
              [this.scoreptr, pageNumber, drawPageBackground, transparent, this.excerptId]
          );
          return WasmRes.readData(dataptr)
      }

      /**
       * Export score as PDF file
       * @returns {Promise<Uint8Array>}
       */
      async savePdf() {
          const dataptr = Module.ccall('savePdf', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return WasmRes.readData(dataptr)
      }

      /**
       * Export score as MIDI file
       * @param {boolean} midiExpandRepeats 
       * @param {boolean} exportRPNs 
       * @returns {Promise<Uint8Array>}
       */
      async saveMidi(midiExpandRepeats = true, exportRPNs = true) {
          const dataptr = Module.ccall('saveMidi',
              'number',
              ['number', 'boolean', 'boolean', 'number'],
              [this.scoreptr, midiExpandRepeats, exportRPNs, this.excerptId]
          );
          return WasmRes.readData(dataptr)
      }

      /**
       * Set the soundfont (sf2/sf3) data
       * @param {Uint8Array} data 
       */
      async setSoundFont(data) {
          return WebMscore.setSoundFont(data)
      }

      /**
       * Export score as audio file (wav/ogg/flac/mp3)
       * @param {'wav' | 'ogg' | 'flac' | 'mp3'} format 
       */
      async saveAudio(format) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const fileformatptr = getStrPtr(format);
          const dataptr = Module.ccall('saveAudio',
              'number',
              ['number', 'number', 'number'],
              [this.scoreptr, fileformatptr, this.excerptId]
          );
          freePtr(fileformatptr);
          return WasmRes.readData(dataptr)
      }

      /**
       * Export a measure range as an audio file.
       * @param {'wav'} format
       * @param {number} startMeasureIndex
       * @param {number} endMeasureIndex
       * @returns {Promise<Uint8Array>}
       */
      async saveAudioForMeasureRange(format, startMeasureIndex, endMeasureIndex) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }
          if (format !== 'wav') {
              throw new Error('saveAudioForMeasureRange currently supports wav only')
          }

          const fileformatptr = getStrPtr(format);
          const dataptr = Module.ccall('saveAudioForMeasureRange',
              'number',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, fileformatptr, startMeasureIndex, endMeasureIndex, this.excerptId]
          );
          freePtr(fileformatptr);
          return WasmRes.readData(dataptr)
      }

      /**
       * Synthesize audio frames
       * 
       * `synthAudio` is single instance, i.e. you can't have multiple iterators. If you call `synthAudio` multiple times, it will reset the time offset of all iterators the function returned.
       * 
       * @param {number} starttime The start time offset in seconds
       * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes>>} The iterator function, see `processSynth`
       */
      async synthAudio(starttime) {
          const fn = await this._synthAudio(starttime);
          return (cancel) => {
              return this.processSynth(fn, cancel)
          }
      }

      /**
       * Synthesize audio frames in bulk
       * @param {number} starttime - The start time offset in seconds
       * @param {number} batchSize - max number of result SynthRes' (n * 512 frames)
       * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
       */
      async synthAudioBatch(starttime, batchSize) {
          const fn = await this._synthAudio(starttime);
          return (cancel) => {
              return this.processSynthBatch(fn, batchSize, cancel)
          }
      }

      /**
       * Synthesize audio frames from the current cursor/selection playback position.
       * @param {number} batchSize - max number of result SynthRes' (n * 512 frames)
       * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
       */
      async synthAudioBatchFromSelection(batchSize) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const iteratorFnPtr = Module.ccall('synthAudioFromSelection',
              'number',
              ['number', 'number'],
              [this.scoreptr, this.excerptId]
          );

          if (!iteratorFnPtr) {
              throw new Error('synthAudioFromSelection: Internal Error.')
          }

          return (cancel) => {
              return this.processSynthBatch(iteratorFnPtr, batchSize, cancel)
          }
      }

      /**
       * Synthesize audio frames for a measure range.
       * @param {number} startMeasureIndex
       * @param {number} endMeasureIndex
       * @param {number} batchSize
       * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
       */
      async synthAudioBatchForMeasureRange(startMeasureIndex, endMeasureIndex, batchSize) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const iteratorFnPtr = Module.ccall('synthAudioForMeasureRange',
              'number',
              ['number', 'number', 'number', 'number'],
              [this.scoreptr, startMeasureIndex, endMeasureIndex, this.excerptId]
          );

          if (!iteratorFnPtr) {
              throw new Error('synthAudioForMeasureRange: Internal Error.')
          }

          return (cancel) => {
              return this.processSynthBatch(iteratorFnPtr, batchSize, cancel)
          }
      }

      /**
       * Synthesize a short isolated preview for the current selection (note/chord).
       * @param {number} batchSize - max number of result SynthRes' (n * 512 frames)
       * @param {number} durationMs - preview duration in milliseconds
       * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
       */
      async synthSelectionPreviewBatch(batchSize, durationMs = 500) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const seconds = Math.max(0.05, Number(durationMs) / 1000);
          const iteratorFnPtr = Module.ccall('synthAudioSelectionPreview',
              'number',
              ['number', 'number', 'number'],
              [this.scoreptr, seconds, this.excerptId]
          );

          if (!iteratorFnPtr) {
              throw new Error('synthAudioSelectionPreview: Internal Error.')
          }

          return (cancel) => {
              return this.processSynthBatch(iteratorFnPtr, batchSize, cancel)
          }
      }

      /**
       * Synthesize audio frames
       * @private
       * @todo GC this iterator function
       * @param {number} starttime The start time offset in seconds
       * @returns {Promise<number>} Pointer to the iterator function
       */
      async _synthAudio(starttime = 0) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const iteratorFnPtr = Module.ccall('synthAudio',
              'number',
              ['number', 'number', 'number'],
              [this.scoreptr, starttime, this.excerptId]
          );

          const success = iteratorFnPtr !== 0;
          if (!success) {
              throw new Error('synthAudio: Internal Error.')
          }

          return iteratorFnPtr
      }

      /**
       * Synthesize audio frames from the current cursor/selection playback position.
       * @private
       * @returns {Promise<number>} Pointer to the iterator function
       */
      async _synthAudioFromSelection() {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const iteratorFnPtr = Module.ccall('synthAudioFromSelection',
              'number',
              ['number', 'number'],
              [this.scoreptr, this.excerptId]
          );

          const success = iteratorFnPtr !== 0;
          if (!success) {
              throw new Error('synthAudioFromSelection: Internal Error.')
          }

          return iteratorFnPtr
      }

      /**
       * Synthesize audio frames for a measure range.
       *
       * The private half of `synthAudioBatchForMeasureRange`, and the layer that
       * was missing. In worker mode `worker-helper.js` never calls the public
       * method — it RPCs the underscore-prefixed one and holds the returned
       * pointer itself, so that the batch iterator can be driven across the
       * thread boundary. Without this, `worker.js` looked up
       * `score['_synthAudioForMeasureRange']`, found nothing, and threw
       * `Cannot read properties of undefined (reading 'apply')` — which reads
       * exactly like a broken WASM build, and is not one: the native export has
       * been there all along.
       *
       * @private
       * @param {number} startMeasureIndex
       * @param {number} endMeasureIndex
       * @returns {Promise<number>} Pointer to the iterator function
       */
      async _synthAudioForMeasureRange(startMeasureIndex, endMeasureIndex) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const iteratorFnPtr = Module.ccall('synthAudioForMeasureRange',
              'number',
              ['number', 'number', 'number', 'number'],
              [this.scoreptr, startMeasureIndex, endMeasureIndex, this.excerptId]
          );

          const success = iteratorFnPtr !== 0;
          if (!success) {
              throw new Error('synthAudioForMeasureRange: Internal Error.')
          }

          return iteratorFnPtr
      }

      /**
       * Synthesize a short isolated preview for the current selection (note/chord).
       * @private
       * @param {number} durationMs - preview duration in milliseconds
       * @returns {Promise<number>} Pointer to the iterator function
       */
      async _synthAudioSelectionPreview(durationMs = 500) {
          if (!WebMscore.hasSoundfont) {
              throw new Error('The soundfont is not set.')
          }

          const seconds = Math.max(0.05, Number(durationMs) / 1000);
          const iteratorFnPtr = Module.ccall('synthAudioSelectionPreview',
              'number',
              ['number', 'number', 'number'],
              [this.scoreptr, seconds, this.excerptId]
          );

          const success = iteratorFnPtr !== 0;
          if (!success) {
              throw new Error('synthAudioSelectionPreview: Internal Error.')
          }

          return iteratorFnPtr
      }

      /**
       * Parse struct SynthRes, then free its memory
       * @private
       * @param {number} resptr - pointer to the SynthRes data
       * @returns {import('../schemas').SynthRes}
       */
      _parseSynthRes(resptr) {
          // struct SynthRes in synthres.h
          const done = Module.getValue(resptr + 0, 'i8');
          const startTime = +Module.getValue(resptr + 4, 'float');  // in seconds
          const endTime = +Module.getValue(resptr + 8, 'float');  // in seconds
          const chunkSize = Module.getValue(resptr + 12, 'i32');
          const chunkPtr = resptr + 16;

          const chunk = new Uint8Array(  // make a copy
              Module.HEAPU8.subarray(chunkPtr, chunkPtr + chunkSize)
          );

          freePtr(resptr);

          return {
              done: !!done,
              startTime, // The chunk's start time in seconds
              endTime,   // The current play time in seconds (the chunk's end time)
              chunk,     // The data chunk of audio frames, non-interleaved float32 PCM, 512 frames, 44100 Hz (44.1 kHz), 0.0116 s (512/44100)
          }
      }

      /**
       * @private
       * @param {number} fnptr - pointer to the iterator function
       * @param {boolean} cancel - cancel the audio synthesis worklet 
       * @returns {Promise<import('../schemas').SynthRes>}
       */
      async processSynth(fnptr, cancel = false) {
          const resptr = Module.ccall('processSynth',
              'number',
              ['number', 'boolean'],
              [fnptr, cancel]
          );
          return this._parseSynthRes(resptr)
      }

      /**
       * @private
       * @param {number} fnptr - pointer to the iterator function
       * @param {number} batchSize - see `synthAudioBatch`
       * @param {boolean} cancel - cancel the audio synthesis worklet 
       */
      async processSynthBatch(fnptr, batchSize, cancel = false) {
          const resArrPtr = Module.ccall('processSynthBatch',
              'number',
              ['number', 'number', 'boolean'],
              [fnptr, batchSize, cancel]
          );

          /** @type {import('../schemas').SynthRes[]} */
          const arr = [];
          for (let i = 0; i < batchSize; i++) {
              // visit the array of pointers to SynthRes data
              const resptr = Module.getValue(resArrPtr + 4 * i, '*'); // 32bit WASM, so one pointer is 4 bytes long
              const r = this._parseSynthRes(resptr);
              arr.push(r);
          }

          freePtr(resArrPtr);
          return arr
      }

      /**
       * Export positions of measures or segments (if `ofSegments` == true) as JSON
       * @param {boolean} ofSegments
       * @also `score.measurePositions()` and `score.segmentPositions()`
       * @returns {Promise<string>}
       */
      async savePositions(ofSegments) {
          const dataptr = Module.ccall('savePositions',
              'number',
              ['number', 'boolean', 'number'],
              [this.scoreptr, ofSegments, this.excerptId]
          );
          return WasmRes.readText(dataptr)
      }

      /**
       * Export score metadata as JSON text
       * @also `score.metadata()`
       * @returns {Promise<string>} contents of the JSON file
       */
      async saveMetadata() {
          const dataptr = Module.ccall('saveMetadata', 'number', ['number'], [this.scoreptr]);
          return WasmRes.readText(dataptr)
      }

      /**
       * Read load-stage timing/profile data for this score.
       * @returns {Promise<Record<string, any>>}
       */
      async loadProfile() {
          const dataptr = Module.ccall('loadProfile', 'number', ['number'], [this.scoreptr]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * Select the topmost selectable element near a page-relative point
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @returns {Promise<boolean>}
       */
      async selectElementAtPoint(pageNumber, x, y) {
          return Module.ccall('selectElementAtPoint',
              'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, this.excerptId]
          )
      }

      /**
       * Select a measure near a page-relative point.
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @returns {Promise<boolean>}
       */
      /**
       * Extend the current range selection to include the bar at a point (Shift+Click)
       * @returns {Promise<boolean>}
       */
      async extendMeasureSelectionAtPoint(pageNumber, x, y) {
          return Module.ccall('extendMeasureSelectionAtPoint',
              'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, this.excerptId]
          )
      }

      async selectMeasureAtPoint(pageNumber, x, y) {
          return Module.ccall('selectMeasureAtPoint',
              'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, this.excerptId]
          )
      }

      /**
       * Select a measure by index for a specific part.
       * @param {number} partIndex
       * @param {number} measureIndex
       * @returns {Promise<boolean>}
       */
      async selectPartMeasureByIndex(partIndex, measureIndex) {
          return Module.ccall('selectPartMeasureByIndex',
              'boolean',
              ['number', 'number', 'number', 'number'],
              [this.scoreptr, partIndex, measureIndex, this.excerptId]
          )
      }

      /**
       * Select a text element near a page-relative point.
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @returns {Promise<boolean>}
       */
      async selectTextElementAtPoint(pageNumber, x, y) {
          return Module.ccall('selectTextElementAtPoint',
              'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, this.excerptId]
          )
      }

      /**
       * Clear current selection
       * @returns {Promise<boolean>}
       */
      async clearSelection() {
          return Module.ccall('clearSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Move selection to the next chord
       * @returns {Promise<boolean>}
       */
      async selectNextChord() {
          return Module.ccall('selectNextChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Move selection to the previous chord
       * @returns {Promise<boolean>}
       */
      async selectPrevChord() {
          return Module.ccall('selectPrevChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Extend selection to the next chord (for Shift+Right arrow)
       * @returns {Promise<boolean>}
       */
      async extendSelectionNextChord() {
          return Module.ccall('extendSelectionNextChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Extend selection to the previous chord (for Shift+Left arrow)
       * @returns {Promise<boolean>}
       */
      async extendSelectionPrevChord() {
          return Module.ccall('extendSelectionPrevChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Whether the engine currently holds a range selection.
       * @returns {Promise<boolean>}
       */
      /**
       * What is on the undo stack: `index` entries applied (0: nothing to undo, `size`: nothing to redo),
       * `size` entries in all, and whether the score is back at its loaded state.
       * @returns {Promise<{index: number, size: number, clean: boolean}>}
       */
      async getUndoInfo() {
          const dataptr = Module.ccall('getUndoInfo', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * The undo entries in [from, to), oldest first: the command names each ran, the element types it changed
       * and the tick range of the selection it was made on (-1 when there was none).
       * @param {number} from
       * @param {number} to
       * @returns {Promise<{commands: string[], elements: string[], tickStart: number, tickEnd: number}[]>}
       */
      async getUndoEntries(from, to) {
          const dataptr = Module.ccall('getUndoEntries', 'number', ['number', 'number', 'number', 'number'], [this.scoreptr, from, to, this.excerptId]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * Moves the undo cursor to `target` (an `index` as getUndoInfo reports it) by undoing or redoing as needed.
       * @param {number} target
       * @returns {Promise<boolean>} whether it got there
       */
      async undoRedoTo(target) {
          return Module.ccall('undoRedoTo', 'boolean', ['number', 'number', 'number'], [this.scoreptr, target, this.excerptId])
      }

      async isSelectionRange() {
          return Module.ccall('isSelectionRange', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Extend selection to the next measure (for Ctrl+Shift+Right arrow)
       * @returns {Promise<boolean>}
       */
      async extendSelectionNextMeasure() {
          return Module.ccall('extendSelectionNextMeasure', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Extend selection to the previous measure (for Ctrl+Shift+Left arrow)
       * @returns {Promise<boolean>}
       */
      async extendSelectionPrevMeasure() {
          return Module.ccall('extendSelectionPrevMeasure', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Extend selection to the staff above (for Shift+Up arrow)
       * @returns {Promise<boolean>}
       */
      async extendSelectionStaffAbove() {
          return Module.ccall('extendSelectionStaffAbove', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Extend selection to the staff below (for Shift+Down arrow)
       * @returns {Promise<boolean>}
       */
      async extendSelectionStaffBelow() {
          return Module.ccall('extendSelectionStaffBelow', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Get the bounding box of the current selection
       * @returns {Promise<{page: number, x: number, y: number, width: number, height: number} | null>}
       */
      async getSelectionBoundingBox() {
          const dataptr = Module.ccall('getSelectionBoundingBox', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          const json = WasmRes.readText(dataptr);
          if (!json) return null
          try {
              return JSON.parse(json)
          } catch (e) {
              return null
          }
      }

      /**
       * Get the bounding boxes of all selected elements (for range selection)
       * @returns {Promise<Array<{page: number, x: number, y: number, width: number, height: number}>>}
       */
      async getSelectionBoundingBoxes() {
          const dataptr = Module.ccall('getSelectionBoundingBoxes', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          const json = WasmRes.readText(dataptr);
          if (!json) return []
          try {
              return JSON.parse(json)
          } catch (e) {
              return []
          }
      }

      /**
       * Add vertical padding below one staff of one measure, or remove it with a gap <= 0.
       *
       * Compare uses this to re-synchronise the panes: a line break can move a bar to another
       * system, but only a spacer can leave a hole where the other pane has an extra bar.
       * @param {number} measureIndex
       * @param {number} staffIdx
       * @param {number} gapSpatium gap in spatium; <= 0 removes the spacer
       * @returns {Promise<boolean>}
       */
      async setMeasureSpacer(measureIndex, staffIdx, gapSpatium) {
          return Module.ccall('setMeasureSpacer',
              'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, measureIndex, staffIdx, gapSpatium, this.excerptId]
          )
      }

      /**
       * Vertical band of each part within each laid-out system, in page coordinates.
       *
       * Measure positions carry no staff dimension, so this is what a caller needs to place
       * a highlight over one part's bar instead of over the whole system. Selection-free, so
       * it neither costs a round trip per bar nor disturbs the user's selection.
       * @returns {Promise<Array<{page: number, system: number, partIndex: number, y: number, height: number}>>}
       */
      async staffSystemBands() {
          const dataptr = Module.ccall('staffSystemBands', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          const json = WasmRes.readText(dataptr);
          if (!json) return []
          try {
              return JSON.parse(json)
          } catch (e) {
              return []
          }
      }

      /**
       * Get the selection MIME type for copy/paste.
       * @returns {Promise<string>}
       */
      async selectionMimeType() {
          const dataptr = Module.ccall('selectionMimeType', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return WasmRes.readText(dataptr)
      }

      /**
       * Get the selection MIME data for copy/paste.
       * @returns {Promise<Uint8Array>}
       */
      async selectionMimeData() {
          const dataptr = Module.ccall('selectionMimeData', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return WasmRes.readData(dataptr)
      }

      /**
       * Paste selection data at the current selection.
       * @param {string} mimeType
       * @param {Uint8Array} data
       * @returns {Promise<boolean>}
       */
      async pasteSelection(mimeType, data) {
          const mimePtr = getStrPtr(mimeType);
          const dataPtr = getTypedArrayPtr(data);
          const result = Module.ccall('pasteSelection', 'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, mimePtr, dataPtr, data.byteLength, this.excerptId]
          );
          freePtr(mimePtr);
          freePtr(dataPtr);
          return result
      }

      /**
       * Select the topmost selectable element near a page-relative point with mode
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @param {0|1|2} mode 0=replace, 1=add, 2=toggle
       * @returns {Promise<boolean>}
       */
      async selectElementAtPointWithMode(pageNumber, x, y, mode) {
          return Module.ccall('selectElementAtPointWithMode',
              'boolean',
              ['number', 'number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, mode, this.excerptId]
          )
      }

      /**
       * Begin an element drag gesture at a page-relative point.
       * Hit-tests the point; if a draggable element is found, selects it and
       * opens an undoable command wrapping the whole gesture.
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @returns {Promise<boolean>} true if a drag gesture started
       */
      async beginElementDrag(pageNumber, x, y) {
          return Module.ccall('beginElementDrag',
              'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, this.excerptId]
          )
      }

      /**
       * Update the active element drag gesture with a new pointer position.
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @param {number} modifiers bitmask: 1=shift, 2=ctrl, 4=alt
       * @param {0|1|2} dragMode 0=both axes, 1=X only, 2=Y only
       * @returns {Promise<boolean>}
       */
      async updateElementDrag(pageNumber, x, y, modifiers = 0, dragMode = 0) {
          return Module.ccall('updateElementDrag',
              'boolean',
              ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, modifiers, dragMode, this.excerptId]
          )
      }

      /**
       * End the active element drag gesture.
       * @param {boolean} commit true to commit (endCmd), false to rollback
       * @returns {Promise<boolean>}
       */
      async endElementDrag(commit) {
          return Module.ccall('endElementDrag',
              'boolean',
              ['number', 'boolean', 'number'],
              [this.scoreptr, commit, this.excerptId]
          )
      }

      /**
       * Apply a supported palette element at a page-relative engraving point.
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @param {0|1|2} elementType 0=clef, 1=dynamic, 2=articulation
       * @param {number} subtype kind-specific subtype
       * @returns {Promise<boolean>}
       */
      async applyDropAtPoint(pageNumber, x, y, elementType, subtype) {
          return Module.ccall('applyDropAtPoint',
              'boolean',
              ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, elementType, subtype, this.excerptId]
          )
      }

      /**
       * Enter grip edit mode for a spanner at a page-relative point.
       * @returns {Promise<{page:number, grips:Array<{index:number,x:number,y:number,draggable:boolean}>}|null>}
       */
      async beginGripEdit(pageNumber, x, y) {
          const dataptr = Module.ccall('beginGripEdit', 'number',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, pageNumber, x, y, this.excerptId]);
          const json = WasmRes.readText(dataptr);
          if (!json) return null
          try {
              return JSON.parse(json)
          } catch (e) {
              return null
          }
      }

      /** Drag one grip by an incremental score-space delta. */
      async dragGrip(gripIndex, dx, dy, modifiers = 0) {
          const dataptr = Module.ccall('dragGrip', 'number',
              ['number', 'number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, gripIndex, dx, dy, modifiers, this.excerptId]);
          const json = WasmRes.readText(dataptr);
          if (!json) return null
          try {
              return JSON.parse(json)
          } catch (e) {
              return null
          }
      }

      /** End grip edit mode, committing or rolling back its undo command. */
      async endGripEdit(commit) {
          return Module.ccall('endGripEdit', 'boolean',
              ['number', 'boolean', 'number'],
              [this.scoreptr, commit, this.excerptId])
      }

      /**
       * The score's spatium (staff space) in engraving canvas units — the same
       * coordinate space used by selection and drag point APIs.
       * @returns {Promise<number>}
       */
      async getSpatium() {
          return Module.ccall('getSpatium',
              'number',
              ['number', 'number'],
              [this.scoreptr, this.excerptId]
          )
      }

      /**
       * Delete the current selection
       * @returns {Promise<boolean>}
       */
      async deleteSelection() {
          return Module.ccall('deleteSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Raise pitch for the current selection
       */
      async pitchUp() {
          return Module.ccall('pitchUp', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Lower pitch for the current selection
       */
      async pitchDown() {
          return Module.ccall('pitchDown', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Transpose the current selection (or whole score if no selection).
       * @param {number} mode         0=TO_KEY, 1=BY_INTERVAL, 2=DIATONICALLY
       * @param {number} direction    0=UP, 1=DOWN, 2=CLOSEST
       * @param {number} key          target key (-7..7, only used for TO_KEY mode)
       * @param {number} interval     interval index (0-25 chromatic, 0-6 diatonic)
       * @param {boolean} trKeys      transpose key signatures
       * @param {boolean} trChordNames transpose chord symbols
       * @param {boolean} useDoubleSharpsFlats use double sharps/flats
       * @returns {Promise<boolean>}
       */
      async transpose(mode, direction, key, interval, trKeys, trChordNames, useDoubleSharpsFlats) {
          return Module.ccall('transpose', 'boolean',
              ['number', 'number', 'number', 'number', 'number', 'boolean', 'boolean', 'boolean', 'number'],
              [this.scoreptr, mode, direction, key, interval, trKeys, trChordNames, useDoubleSharpsFlats, this.excerptId])
      }

      /**
       * Select all elements in the score.
       * @returns {Promise<boolean>}
       */
      async selectAll() {
          return Module.ccall('selectAll', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Set accidental for the current selection.
       * @param {number} accidentalType see engraving::AccidentalType enum
       * @returns {Promise<boolean>}
       */
      async setAccidental(accidentalType) {
          return Module.ccall('setAccidental', 'boolean', ['number', 'number', 'number'], [this.scoreptr, accidentalType, this.excerptId])
      }

      /**
       * Double the duration of the current selection
       */
      async doubleDuration() {
          return Module.ccall('doubleDuration', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Halve the duration of the current selection
       */
      async halfDuration() {
          return Module.ccall('halfDuration', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Toggle dotted duration on the current selection
       */
      async toggleDot() {
          return Module.ccall('toggleDot', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Toggle double-dotted duration on the current selection
       */
      async toggleDoubleDot() {
          return Module.ccall('toggleDoubleDot', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Enable or disable note entry mode
       * @param {boolean} enabled
       * @returns {Promise<boolean>}
       */
      async setNoteEntryMode(enabled) {
          return Module.ccall('setNoteEntryMode', 'boolean', ['number', 'number', 'number'], [this.scoreptr, enabled ? 1 : 0, this.excerptId])
      }

      /**
       * Get the engine-owned note input cursor in page coordinates.
       * @returns {Promise<{page: number, x: number, y: number, width: number, height: number, voice: number} | null>}
       */
      async getNoteInputCursorRect() {
          const dataptr = Module.ccall('getNoteInputCursorRect', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          const json = WasmRes.readText(dataptr);
          if (!json) return null
          try {
              return JSON.parse(json)
          } catch (e) {
              return null
          }
      }

      /**
       * Set note entry method
       * @param {number} method see engraving::NoteEntryMethod enum
       * @returns {Promise<boolean>}
       */
      async setNoteEntryMethod(method) {
          return Module.ccall('setNoteEntryMethod', 'boolean', ['number', 'number', 'number'], [this.scoreptr, method, this.excerptId])
      }

      /**
       * Seed input state (segment/track/duration) from the current selection
       * @returns {Promise<boolean>}
       */
      async setInputStateFromSelection() {
          return Module.ccall('setInputStateFromSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Set accidental type for note entry input
       * @param {number} accidentalType see engraving::AccidentalType enum
       * @returns {Promise<boolean>}
       */
      async setInputAccidentalType(accidentalType) {
          return Module.ccall('setInputAccidentalType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, accidentalType, this.excerptId])
      }

      /**
       * Set input duration type for note entry
       * @param {number} durationType see engraving::DurationType enum
       * @returns {Promise<boolean>}
       */
      async setInputDurationType(durationType) {
          return Module.ccall('setInputDurationType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, durationType, this.excerptId])
      }

      /**
       * Toggle dotting for the current input duration
       * @returns {Promise<boolean>}
       */
      async toggleInputDot() {
          return Module.ccall('toggleInputDot', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Place a note at a page-relative point while in note entry mode
       * (click-to-place). Honors the current input duration/accidental/voice.
       * @param {number} pageNumber zero-based page index
       * @param {number} x
       * @param {number} y
       * @param {boolean} replace
       * @param {boolean} insert
       * @returns {Promise<boolean>}
       */
      async putNote(pageNumber, x, y, replace = false, insert = false) {
          return Module.ccall('putNote',
              'boolean',
              ['number', 'number', 'number', 'number', 'boolean', 'boolean', 'number'],
              [this.scoreptr, pageNumber, x, y, replace, insert, this.excerptId]
          )
      }

      /**
       * Add a pitch by letter step (0=C ... 6=B)
       * @param {number} note
       * @param {boolean} addToChord
       * @param {boolean} insert
       * @returns {Promise<boolean>}
       */
      async addPitchByStep(note, addToChord = false, insert = false) {
          return Module.ccall(
              'addPitchByStep',
              'boolean',
              ['number', 'number', 'number', 'number', 'number'],
              [this.scoreptr, note, addToChord ? 1 : 0, insert ? 1 : 0, this.excerptId],
          )
      }

      /**
       * Enter a rest at the input cursor using the current duration
       * @returns {Promise<boolean>}
       */
      async enterRest() {
          return Module.ccall('enterRest', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Set duration type for the current selection
       * @param {number} durationType see engraving::DurationType enum
       * @returns {Promise<boolean>}
       */
      async setDurationType(durationType) {
          return Module.ccall('setDurationType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, durationType, this.excerptId])
      }

      /**
       * Toggle a line break on the selected measure
       */
      async toggleLineBreak() {
          return Module.ccall('toggleLineBreak', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Toggle a page break on the selected measure
       */
      async togglePageBreak() {
          return Module.ccall('togglePageBreak', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Set voice index (0-3) for input/selection
       * @param {number} voiceIndex
       * @returns {Promise<boolean>}
       */
      async setVoice(voiceIndex) {
          return Module.ccall('setVoice', 'boolean', ['number', 'number', 'number'], [this.scoreptr, voiceIndex, this.excerptId])
      }

      /**
       * Move selected elements to another voice
       * @param {number} voiceIndex
       * @returns {Promise<boolean>}
       */
      async changeSelectedElementsVoice(voiceIndex) {
          return Module.ccall('changeSelectedElementsVoice', 'boolean', ['number', 'number', 'number'], [this.scoreptr, voiceIndex, this.excerptId])
      }

      /**
       * Undo the last command
       */
      async undo() {
          return Module.ccall('undo', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Redo the last undone command
       */
      async redo() {
          return Module.ccall('redo', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Force a relayout and update of the current score
       */
      async relayout() {
          return Module.ccall('relayout', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Incrementally layout enough of the score so `pageNumber` can be exported.
       * Useful for faster first paint on very large scores loaded with `doLayout=false`.
       * @param {number} pageNumber zero-based target page index
       * @returns {Promise<boolean>}
       */
      async layoutUntilPage(pageNumber = 0) {
          return Module.ccall('layoutUntilPage', 'boolean', ['number', 'number', 'number'], [this.scoreptr, pageNumber, this.excerptId])
      }

      /**
       * Incrementally layout until target page and return structured progress state.
       * @param {number} pageNumber zero-based target page index
       * @returns {Promise<Record<string, any>>}
       */
      async layoutUntilPageState(pageNumber = 0) {
          const dataptr = Module.ccall('layoutUntilPageState', 'number', ['number', 'number', 'number'], [this.scoreptr, pageNumber, this.excerptId]);
          return JSON.parse(WasmRes.readText(dataptr))
      }

      /**
       * Set the layout mode for rendering (e.g., PAGE, LINE).
       * @param {number} layoutMode see engraving::LayoutMode enum
       * @returns {Promise<boolean>}
       */
      async setLayoutMode(layoutMode) {
          return Module.ccall('setLayoutMode', 'boolean', ['number', 'number', 'number'], [this.scoreptr, layoutMode, this.excerptId])
      }

      /**
       * Get the current layout mode.
       * @returns {Promise<number>}
       */
      async getLayoutMode() {
          const dataptr = Module.ccall('getLayoutMode', 'number', ['number', 'number'], [this.scoreptr, this.excerptId]);
          return WasmRes.readNum(dataptr)
      }

      /**
       * Add a dynamic marking at the current selection
       * @param {number} dynamicType see engraving::DynamicType enum
       * @returns {Promise<boolean>}
       */
      async addDynamic(dynamicType) {
          return Module.ccall('addDynamic', 'boolean', ['number', 'number', 'number'], [this.scoreptr, dynamicType, this.excerptId])
      }

      /**
       * Add a hairpin at the current selection
       * @param {number} hairpinType see engraving::HairpinType enum (0=cresc, 1=decresc)
       * @returns {Promise<boolean>}
       */
      async addHairpin(hairpinType) {
          return Module.ccall('addHairpin', 'boolean', ['number', 'number', 'number'], [this.scoreptr, hairpinType, this.excerptId])
      }

      /** Add a fermata variant to each selected chord/rest. */
      async addFermata(fermataVariant) {
          return Module.ccall('addFermata', 'boolean', ['number', 'number', 'number'], [this.scoreptr, fermataVariant, this.excerptId])
      }

      /** Add a breath or caesura to each selected chord/rest boundary. */
      async addBreath(breathType) {
          return Module.ccall('addBreath', 'boolean', ['number', 'number', 'number'], [this.scoreptr, breathType, this.excerptId])
      }

      /** Add an arpeggio to each selected multi-note chord. */
      async addArpeggio(arpeggioType) {
          return Module.ccall('addArpeggio', 'boolean', ['number', 'number', 'number'], [this.scoreptr, arpeggioType, this.excerptId])
      }

      /** Add a single- or two-note tremolo to the selected chord(s). */
      async addTremolo(tremoloType) {
          return Module.ccall('addTremolo', 'boolean', ['number', 'number', 'number'], [this.scoreptr, tremoloType, this.excerptId])
      }

      /** Add an ottava line to the current selection. */
      async addOttava(ottavaType) {
          return Module.ccall('addOttava', 'boolean', ['number', 'number', 'number'], [this.scoreptr, ottavaType, this.excerptId])
      }

      /** Add a trill line to the current selection. */
      async addTrill(trillType) {
          return Module.ccall('addTrill', 'boolean', ['number', 'number', 'number'], [this.scoreptr, trillType, this.excerptId])
      }

      /** Add a glissando between exactly two selected notes. */
      async addGlissando(glissandoType) {
          return Module.ccall('addGlissando', 'boolean', ['number', 'number', 'number'], [this.scoreptr, glissandoType, this.excerptId])
      }

      /** Add a semantic navigation marker to the selected measure. */
      async addMarker(markerType) {
          return Module.ccall('addMarker', 'boolean', ['number', 'number', 'number'], [this.scoreptr, markerType, this.excerptId])
      }

      /** Add a semantic playback jump to the selected measure. */
      async addJump(jumpType) {
          return Module.ccall('addJump', 'boolean', ['number', 'number', 'number'], [this.scoreptr, jumpType, this.excerptId])
      }

      /** Apply a curated notehead group to the selected notes. */
      async setNoteheadGroup(noteheadGroup) {
          return Module.ccall('setNoteheadGroup', 'boolean', ['number', 'number', 'number'], [this.scoreptr, noteheadGroup, this.excerptId])
      }

      /** Apply a MuseScore beam mode to the selected chord/rests. */
      async setBeamMode(beamMode) {
          return Module.ccall('setBeamMode', 'boolean', ['number', 'number', 'number'], [this.scoreptr, beamMode, this.excerptId])
      }

      /** Replace the native range-selection filter bitmask. */
      async setSelectionFilter(filterMask) {
          return Module.ccall('setSelectionFilter', 'boolean', ['number', 'number', 'number'], [this.scoreptr, filterMask, this.excerptId])
      }

      /** Replace empty selected measures with a semantic measure-repeat group. */
      async addMeasureRepeat(numMeasures) {
          return Module.ccall('addMeasureRepeat', 'boolean', ['number', 'number', 'number'], [this.scoreptr, numMeasures, this.excerptId])
      }

      /** Enable or disable score-wide multi-measure rest creation. */
      async setMultiMeasureRests(enabled) {
          return Module.ccall('setMultiMeasureRests', 'boolean', ['number', 'boolean', 'number'], [this.scoreptr, enabled, this.excerptId])
      }

      async multiMeasureRestsEnabled() {
          return Module.ccall('multiMeasureRestsEnabled', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Add a pedal marking at the current selection
       * @param {number} pedalVariant 0=line, 1=text
       * @returns {Promise<boolean>}
       */
      async addPedal(pedalVariant) {
          return Module.ccall('addPedal', 'boolean', ['number', 'number', 'number'], [this.scoreptr, pedalVariant, this.excerptId])
      }

      /**
       * Add a sostenuto pedal marking at the current selection
       * @returns {Promise<boolean>}
       */
      async addSostenutoPedal() {
          return Module.ccall('addSostenutoPedal', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Add an una corda marking at the current selection
       * @returns {Promise<boolean>}
       */
      async addUnaCorda() {
          return Module.ccall('addUnaCorda', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Split a pedal line at the current selection
       * @returns {Promise<boolean>}
       */
      async splitPedal() {
          return Module.ccall('splitPedal', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Add a rehearsal mark at the current selection
       * @returns {Promise<boolean>}
       */
      async addRehearsalMark() {
          return Module.ccall('addRehearsalMark', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Add tempo text at the current selection
       * @param {number} bpm
       * @returns {Promise<boolean>}
       */
      async addTempoText(bpm) {
          return Module.ccall('addTempoText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, bpm, this.excerptId])
      }

      /**
       * Add staff text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addStaffText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addStaffText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add system text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addSystemText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addSystemText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add expression text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addExpressionText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addExpressionText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add lyric text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addLyricText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addLyricText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add harmony text at the current selection
       * @param {number} variant 0=standard, 1=roman, 2=nashville
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addHarmonyText(variant, text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addHarmonyText', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, variant, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add fingering text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addFingeringText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addFingeringText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add left-hand guitar fingering text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addLeftHandGuitarFingeringText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall(
                  'addLeftHandGuitarFingeringText',
                  'boolean',
                  ['number', 'number', 'number'],
                  [this.scoreptr, strptr, this.excerptId],
              )
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add right-hand guitar fingering text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addRightHandGuitarFingeringText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall(
                  'addRightHandGuitarFingeringText',
                  'boolean',
                  ['number', 'number', 'number'],
                  [this.scoreptr, strptr, this.excerptId],
              )
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add string number text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addStringNumberText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addStringNumberText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add instrument change text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addInstrumentChangeText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addInstrumentChangeText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add sticking text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addStickingText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addStickingText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add figured bass text at the current selection
       * @param {string} text
       * @returns {Promise<boolean>}
       */
      async addFiguredBassText(text) {
          const strptr = getStrPtr(text == null ? '' : String(text));
          try {
              return Module.ccall('addFiguredBassText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add or remove an articulation on the selected notes/chords.
       * @param {string} articulationSymbolName e.g. "articStaccatoAbove"
       * @returns {Promise<boolean>}
       */
      async addArticulation(articulationSymbolName) {
          const strptr = getStrPtr(articulationSymbolName);
          try {
              return Module.ccall('addArticulation', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Add a slur spanning the current selection.
       * - With a single selected note, this slurs to the next chord/rest.
       * - With multi-selection, this slurs from the first selected chord/rest to the last.
       * @returns {Promise<boolean>}
       */
      /** Flip the stem direction of the selected note(s)/chord(s). */
      async flipStem() {
          return Module.ccall('flipStem', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      async addSlur() {
          return Module.ccall('addSlur', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Add a tie from the selected note(s) to the next matching pitch.
       * @returns {Promise<boolean>}
       */
      async addTie() {
          return Module.ccall('addTie', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Add a grace note of the specified type to the selected note(s).
       * @param {number} graceType
       * @returns {Promise<boolean>}
       */
      async addGraceNote(graceType) {
          return Module.ccall('addGraceNote', 'boolean', ['number', 'number', 'number'], [this.scoreptr, graceType, this.excerptId])
      }

      /**
       * Add a simple tuplet (e.g. 3, 5, 7) at the current selection.
       * @param {number} tupletCount
       * @returns {Promise<boolean>}
       */
      async addTuplet(tupletCount) {
          return Module.ccall('addTuplet', 'boolean', ['number', 'number', 'number'], [this.scoreptr, tupletCount, this.excerptId])
      }

      /**
       * Convert a selected rest into a note
       * @returns {Promise<boolean>}
       */
      async addNoteFromRest() {
          return Module.ccall('addNoteFromRest', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Toggle a repeat start on the selected measure
       */
      async toggleRepeatStart() {
          return Module.ccall('toggleRepeatStart', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Toggle a repeat end on the selected measure
       */
      async toggleRepeatEnd() {
          return Module.ccall('toggleRepeatEnd', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Set the repeat count on the selected measure
       * @param {number} count
       */
      async setRepeatCount(count) {
          return Module.ccall('setRepeatCount', 'boolean', ['number', 'number', 'number'], [this.scoreptr, count, this.excerptId])
      }

      /**
       * Set the end barline type on the selected measure
       * @param {number} barLineType
       */
      async setBarLineType(barLineType) {
          return Module.ccall('setBarLineType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, barLineType, this.excerptId])
      }

      /**
       * Add a volta ending at the selected measure or range
       * @param {number} endingNumber
       */
      async addVolta(endingNumber) {
          return Module.ccall('addVolta', 'boolean', ['number', 'number', 'number'], [this.scoreptr, endingNumber, this.excerptId])
      }

      /**
       * Insert new measures around the current selection or score edges.
       * @param {number} count
       * @param {number} target Target enum: 0 after selection, 1 before selection, 2 start of score, 3 end of score
       */
      async insertMeasures(count, target) {
          return Module.ccall('insertMeasures', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, count, target, this.excerptId])
      }

      /**
       * Add a pickup (anacrusis) measure at the start of the score.
       * @param {number} numerator  Pickup duration numerator
       * @param {number} denominator  Pickup duration denominator
       * @returns {Promise<boolean>}
       */
      async addPickupMeasure(numerator, denominator) {
          return Module.ccall('addPickupMeasure', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, numerator, denominator, this.excerptId])
      }

      /**
       * Remove all trailing empty measures from the end of the score
       * @returns {Promise<boolean>}
       */
      async removeTrailingEmptyMeasures() {
          return Module.ccall('removeTrailingEmptyMeasures', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Remove the measure(s) containing the current selection.
       * @returns {Promise<boolean>}
       */
      async removeSelectedMeasures() {
          return Module.ccall('removeSelectedMeasures', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Set the time signature (global) at the start of the score
       * @param {number} numerator
       * @param {number} denominator
       * @returns {Promise<boolean>}
       */
      async setTimeSignature(numerator, denominator) {
          return Module.ccall('setTimeSignature', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, numerator, denominator, this.excerptId])
      }

      /**
       * Set the time signature (global) with a specific display type.
       * @param {number} numerator
       * @param {number} denominator
       * @param {number} timeSigType 0=Normal, 1=Common time, 2=Cut time
       * @returns {Promise<boolean>}
       */
      async setTimeSignatureWithType(numerator, denominator, timeSigType) {
          return Module.ccall('setTimeSignatureWithType', 'boolean', ['number', 'number', 'number', 'number', 'number'], [this.scoreptr, numerator, denominator, timeSigType, this.excerptId])
      }

      /**
       * Set the key signature (global) at the start of the score.
       * @param {number} fifths -7..+7 (Cb..C#)
       * @returns {Promise<boolean>}
       */
      async setKeySignature(fifths) {
          return Module.ccall('setKeySignature', 'boolean', ['number', 'number', 'number'], [this.scoreptr, fifths, this.excerptId])
      }

      /**
       * Set chord symbol interpretation mode.
       * @param {boolean} literal true = Literal, false = Jazz
       * @returns {Promise<boolean>}
       */
      async setHarmonyVoiceLiteral(literal) {
          return Module.ccall('setHarmonyVoiceLiteral', 'boolean', ['number', 'boolean', 'number'], [this.scoreptr, literal, this.excerptId])
      }

      /**
       * Set chord symbol style preset.
       * @param {'std' | 'jazz'} preset
       * @returns {Promise<boolean>}
       */
      async setChordSymbolStylePreset(preset) {
          const strptr = getStrPtr(preset == null ? '' : String(preset));
          try {
              return Module.ccall('setChordSymbolStylePreset', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
          } finally {
              freePtr(strptr);
          }
      }

      /**
       * Get the key signature (global) at the start of the score.
       * @returns {Promise<number>} fifths -7..+7 (Cb..C#)
       */
      async getKeySignature() {
          return Module.ccall('getKeySignature', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
      }

      /**
       * Insert a clef at the current selection/input position
       * @param {number} clefType see engraving::ClefType enum
       * @returns {Promise<boolean>}
       */
      async setClef(clefType) {
          return Module.ccall('setClef', 'boolean', ['number', 'number', 'number'], [this.scoreptr, clefType, this.excerptId])
      }

      /**
       * @param {boolean=} soft (default `true`)
       *                 * `true`  destroy the score instance only, or
       *                 * `false` destroy the whole WebMscore context 
       * @returns {void}
       */
      destroy(soft = true) {
          if (!soft) {
              throw new Error('unimplemented')
          }

          Module.ccall('destroy', 'void', ['number'], [this.scoreptr]);
          freePtr(this.scoreptr);
      }

  }

  const SVG_UTF8_RESULT_KEY = '__webmscoreSvgUtf8';
  const DEBUG_RENDER_RPC = false;

  /** @type {WebMscore} */
  let score;

  /**
   * @typedef {{ id: number; method: Exclude<keyof import('./index').default, 'scoreptr' | 'excerptId'> | 'load' | 'ready' | 'setLogLevel'; params: any[]; }} RPCReq
   * @typedef {{ id: number; result?: any; error?: any; }} RPCRes
   * @param {number} id 
   * @param {any} result 
   * @param {Transferable[]} transfer
   */
  const rpcRes = (id, result, transfer = undefined) => {
      /** @type {RPCRes} */
      const res = {
          id,
          result,
      };
      self.postMessage(res, transfer);
  };

  /**
   * @param {number} id 
   * @param {Error} err 
   */
  const rpcErr = (id, err) => {
      /** @type {RPCRes} */
      const res = {
          id,
          error: {
              name: err.name,
              message: err.message,
              stack: err.stack,
          },
      };
      self.postMessage(res);
  };

  /**
   * @typedef {import('../schemas').SynthRes | Uint8Array | undefined} Res
   * @param {Res | Res[]} obj 
   * @returns {Transferable[] | undefined}
   */
  const getTransferable = (obj) => {
      if (!obj) return
      if (Array.isArray(obj)) {
          return obj.reduce((p, c) => p.concat(getTransferable(c)), []).filter(Boolean)
      } else if (obj instanceof Uint8Array) {
          return [obj.buffer]
      } else if (obj.chunk instanceof Uint8Array) {
          return [obj.chunk.buffer]
      }
  };

  self.onmessage = async (e) => {
      /** @type {RPCReq} */
      const req = e.data;  // JSON-RPC
      const { id, method, params } = req;

      try {
          switch (method) {
              case 'ready':
                  await WebMscore.ready;
                  rpcRes(id, 'done');
                  break

              case 'load':
                  await WebMscore.ready;
                  score = await WebMscore.load.apply(undefined, params);
                  rpcRes(id, { systemLocks: typeof score.getSystemLockState === 'function' });
                  break;

              case 'setLogLevel':
                  await WebMscore.setLogLevel.apply(undefined, params);
                  rpcRes(id, 'done');
                  break

              case 'setResourceBaseUrl':
                  WebMscore.resourceBaseUrl = params[0];
                  rpcRes(id, 'done');
                  break

              default:
                  if (!score) { rpcErr(id, new Error('Score not loaded')); }
                  if (DEBUG_RENDER_RPC && (method === 'saveSvg' || method === 'savePng')) ;
                  if (method === 'saveSvg' && typeof score.saveSvgRaw === 'function') {
                      const svgBytes = await score.saveSvgRaw.apply(score, params);
                      if (DEBUG_RENDER_RPC && (method === 'saveSvg' || method === 'savePng')) ;
                      rpcRes(id, { [SVG_UTF8_RESULT_KEY]: svgBytes }, [svgBytes.buffer]);
                      break
                  }
                  const result = await score[method].apply(score, params);
                  if (DEBUG_RENDER_RPC && (method === 'saveSvg' || method === 'savePng')) ;
                  if (method === 'saveSvg' && typeof result === 'string') {
                      // Transfer UTF-8 bytes instead of a giant JS string payload.
                      // This reduces structured-clone overhead for large pages.
                      const encoded = new TextEncoder().encode(result);
                      rpcRes(id, { [SVG_UTF8_RESULT_KEY]: encoded }, [encoded.buffer]);
                  } else {
                      rpcRes(id, result, getTransferable(result));
                  }
          }
      } catch (err) {
          rpcErr(id, err);
      }
  };

})();
};

typeof process==='object'&&typeof process.versions==='object'&&typeof process.versions.node==='string';var getSelfURL=function getSelfURL(){var url="";if(!url){if(typeof document!=='undefined'){url=document.currentScript&&document.currentScript.src||document.baseURI;}else if(typeof location!=='undefined'){url=location.href;}}return url;};var shimDom=function shimDom(){var getGlobalThis=function getGlobalThis(){if(typeof self!=='undefined'){return self;}if(typeof window!=='undefined'){return window;}if(typeof global!=='undefined'){return global;}throw new Error('unable to locate global object');};var globalthis=getGlobalThis();if(!globalthis.window){if(typeof importScripts==='function'){globalthis.window=globalthis;}else {globalthis.window={addEventListener:function addEventListener(){},location:new URL("file:///"),encodeURIComponent:encodeURIComponent};}}if(!globalthis.navigator){try{globalthis.navigator={};}catch(_unused){}}};

function _toConsumableArray(r){return _arrayWithoutHoles(r)||_iterableToArray(r)||_unsupportedIterableToArray(r)||_nonIterableSpread();}function _nonIterableSpread(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");}function _iterableToArray(r){if("undefined"!=typeof Symbol&&null!=r[Symbol.iterator]||null!=r["@@iterator"])return Array.from(r);}function _arrayWithoutHoles(r){if(Array.isArray(r))return _arrayLikeToArray(r);}function _slicedToArray(r,e){return _arrayWithHoles(r)||_iterableToArrayLimit(r,e)||_unsupportedIterableToArray(r,e)||_nonIterableRest();}function _nonIterableRest(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");}function _unsupportedIterableToArray(r,a){if(r){if("string"==typeof r)return _arrayLikeToArray(r,a);var t={}.toString.call(r).slice(8,-1);return "Object"===t&&r.constructor&&(t=r.constructor.name),"Map"===t||"Set"===t?Array.from(r):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?_arrayLikeToArray(r,a):void 0;}}function _arrayLikeToArray(r,a){(null==a||a>r.length)&&(a=r.length);for(var e=0,n=Array(a);e<a;e++)n[e]=r[e];return n;}function _iterableToArrayLimit(r,l){var t=null==r?null:"undefined"!=typeof Symbol&&r[Symbol.iterator]||r["@@iterator"];if(null!=t){var e,n,i,u,a=[],f=!0,o=!1;try{if(i=(t=t.call(r)).next,0===l){if(Object(t)!==t)return;f=!1;}else for(;!(f=(e=i.call(t)).done)&&(a.push(e.value),a.length!==l);f=!0);}catch(r){o=!0,n=r;}finally{try{if(!f&&null!=t.return&&(u=t.return(),Object(u)!==u))return;}finally{if(o)throw n;}}return a;}}function _arrayWithHoles(r){if(Array.isArray(r))return r;}function _regeneratorRuntime(){var r=_regenerator(),e=r.m(_regeneratorRuntime),t=(Object.getPrototypeOf?Object.getPrototypeOf(e):e.__proto__).constructor;function n(r){var e="function"==typeof r&&r.constructor;return !!e&&(e===t||"GeneratorFunction"===(e.displayName||e.name));}var o={throw:1,return:2,break:3,continue:3};function a(r){var e,t;return function(n){e||(e={stop:function stop(){return t(n.a,2);},catch:function _catch(){return n.v;},abrupt:function abrupt(r,e){return t(n.a,o[r],e);},delegateYield:function delegateYield(r,o,a){return e.resultName=o,t(n.d,_regeneratorValues(r),a);},finish:function finish(r){return t(n.f,r);}},t=function t(r,_t,o){n.p=e.prev,n.n=e.next;try{return r(_t,o);}finally{e.next=n.n;}}),e.resultName&&(e[e.resultName]=n.v,e.resultName=void 0),e.sent=n.v,e.next=n.n;try{return r.call(this,e);}finally{n.p=e.prev,n.n=e.next;}};}return (_regeneratorRuntime=function _regeneratorRuntime(){return {wrap:function wrap(e,t,n,o){return r.w(a(e),t,n,o&&o.reverse());},isGeneratorFunction:n,mark:r.m,awrap:function awrap(r,e){return new _OverloadYield(r,e);},AsyncIterator:_regeneratorAsyncIterator,async:function async(r,e,t,o,u){return (n(e)?_regeneratorAsyncGen:_regeneratorAsync)(a(r),e,t,o,u);},keys:_regeneratorKeys,values:_regeneratorValues};})();}function _regeneratorValues(e){if(null!=e){var t=e["function"==typeof Symbol&&Symbol.iterator||"@@iterator"],r=0;if(t)return t.call(e);if("function"==typeof e.next)return e;if(!isNaN(e.length))return {next:function next(){return e&&r>=e.length&&(e=void 0),{value:e&&e[r++],done:!e};}};}throw new TypeError(typeof e+" is not iterable");}function _regeneratorKeys(e){var n=Object(e),r=[];for(var t in n)r.unshift(t);return function e(){for(;r.length;)if((t=r.pop())in n)return e.value=t,e.done=!1,e;return e.done=!0,e;};}function _regeneratorAsync(n,e,r,t,o){var a=_regeneratorAsyncGen(n,e,r,t,o);return a.next().then(function(n){return n.done?n.value:a.next();});}function _regeneratorAsyncGen(r,e,t,o,n){return new _regeneratorAsyncIterator(_regenerator().w(r,e,t,o),n||Promise);}function _regeneratorAsyncIterator(t,e){function n(r,o,i,f){try{var c=t[r](o),u=c.value;return u instanceof _OverloadYield?e.resolve(u.v).then(function(t){n("next",t,i,f);},function(t){n("throw",t,i,f);}):e.resolve(u).then(function(t){c.value=t,i(c);},function(t){return n("throw",t,i,f);});}catch(t){f(t);}}var r;this.next||(_regeneratorDefine2(_regeneratorAsyncIterator.prototype),_regeneratorDefine2(_regeneratorAsyncIterator.prototype,"function"==typeof Symbol&&Symbol.asyncIterator||"@asyncIterator",function(){return this;})),_regeneratorDefine2(this,"_invoke",function(t,o,i){function f(){return new e(function(e,r){n(t,i,e,r);});}return r=r?r.then(f,f):f();},!0);}function _regenerator(){var e,t,r="function"==typeof Symbol?Symbol:{},n=r.iterator||"@@iterator",o=r.toStringTag||"@@toStringTag";function i(r,n,o,i){var c=n&&n.prototype instanceof Generator?n:Generator,u=Object.create(c.prototype);return _regeneratorDefine2(u,"_invoke",function(r,n,o){var i,c,u,f=0,p=o||[],y=!1,G={p:0,n:0,v:e,a:d,f:d.bind(e,4),d:function d(t,r){return i=t,c=0,u=e,G.n=r,a;}};function d(r,n){for(c=r,u=n,t=0;!y&&f&&!o&&t<p.length;t++){var o,i=p[t],d=G.p,l=i[2];r>3?(o=l===n)&&(u=i[(c=i[4])?5:(c=3,3)],i[4]=i[5]=e):i[0]<=d&&((o=r<2&&d<i[1])?(c=0,G.v=n,G.n=i[1]):d<l&&(o=r<3||i[0]>n||n>l)&&(i[4]=r,i[5]=n,G.n=l,c=0));}if(o||r>1)return a;throw y=!0,n;}return function(o,p,l){if(f>1)throw TypeError("Generator is already running");for(y&&1===p&&d(p,l),c=p,u=l;(t=c<2?e:u)||!y;){i||(c?c<3?(c>1&&(G.n=-1),d(c,u)):G.n=u:G.v=u);try{if(f=2,i){if(c||(o="next"),t=i[o]){if(!(t=t.call(i,u)))throw TypeError("iterator result is not an object");if(!t.done)return t;u=t.value,c<2&&(c=0);}else 1===c&&(t=i.return)&&t.call(i),c<2&&(u=TypeError("The iterator does not provide a '"+o+"' method"),c=1);i=e;}else if((t=(y=G.n<0)?u:r.call(n,G))!==a)break;}catch(t){i=e,c=1,u=t;}finally{f=1;}}return {value:t,done:y};};}(r,o,i),!0),u;}var a={};function Generator(){}function GeneratorFunction(){}function GeneratorFunctionPrototype(){}t=Object.getPrototypeOf;var c=[][n]?t(t([][n]())):(_regeneratorDefine2(t={},n,function(){return this;}),t),u=GeneratorFunctionPrototype.prototype=Generator.prototype=Object.create(c);function f(e){return Object.setPrototypeOf?Object.setPrototypeOf(e,GeneratorFunctionPrototype):(e.__proto__=GeneratorFunctionPrototype,_regeneratorDefine2(e,o,"GeneratorFunction")),e.prototype=Object.create(u),e;}return GeneratorFunction.prototype=GeneratorFunctionPrototype,_regeneratorDefine2(u,"constructor",GeneratorFunctionPrototype),_regeneratorDefine2(GeneratorFunctionPrototype,"constructor",GeneratorFunction),GeneratorFunction.displayName="GeneratorFunction",_regeneratorDefine2(GeneratorFunctionPrototype,o,"GeneratorFunction"),_regeneratorDefine2(u),_regeneratorDefine2(u,o,"Generator"),_regeneratorDefine2(u,n,function(){return this;}),_regeneratorDefine2(u,"toString",function(){return "[object Generator]";}),(_regenerator=function _regenerator(){return {w:i,m:f};})();}function _regeneratorDefine2(e,r,n,t){var i=Object.defineProperty;try{i({},"",{});}catch(e){i=0;}_regeneratorDefine2=function _regeneratorDefine(e,r,n,t){function o(r,n){_regeneratorDefine2(e,r,function(e){return this._invoke(r,n,e);});}r?i?i(e,r,{value:n,enumerable:!t,configurable:!t,writable:!t}):e[r]=n:(o("next",0),o("throw",1),o("return",2));},_regeneratorDefine2(e,r,n,t);}function _OverloadYield(e,d){this.v=e,this.k=d;}function asyncGeneratorStep(n,t,e,r,o,a,c){try{var i=n[a](c),u=i.value;}catch(n){return void e(n);}i.done?t(u):Promise.resolve(u).then(r,o);}function _asyncToGenerator(n){return function(){var t=this,e=arguments;return new Promise(function(r,o){var a=n.apply(t,e);function _next(n){asyncGeneratorStep(a,r,o,_next,_throw,"next",n);}function _throw(n){asyncGeneratorStep(a,r,o,_next,_throw,"throw",n);}_next(void 0);});};}function _defineProperties(e,r){for(var t=0;t<r.length;t++){var o=r[t];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,_toPropertyKey(o.key),o);}}function _createClass(e,r,t){return r&&_defineProperties(e.prototype,r),t&&_defineProperties(e,t),Object.defineProperty(e,"prototype",{writable:!1}),e;}function _toPropertyKey(t){var i=_toPrimitive(t,"string");return "symbol"==typeof i?i:i+"";}function _toPrimitive(t,r){if("object"!=typeof t||!t)return t;var e=t[Symbol.toPrimitive];if(void 0!==e){var i=e.call(t,r||"default");if("object"!=typeof i)return i;throw new TypeError("@@toPrimitive must return a primitive value.");}return ("string"===r?String:Number)(t);}function _classCallCheck(a,n){if(!(a instanceof n))throw new TypeError("Cannot call a class as a function");}function _inherits(t,e){if("function"!=typeof e&&null!==e)throw new TypeError("Super expression must either be null or a function");t.prototype=Object.create(e&&e.prototype,{constructor:{value:t,writable:!0,configurable:!0}}),Object.defineProperty(t,"prototype",{writable:!1}),e&&_setPrototypeOf(t,e);}function _createSuper(t){var r=_isNativeReflectConstruct();return function(){var e,o=_getPrototypeOf(t);if(r){var s=_getPrototypeOf(this).constructor;e=Reflect.construct(o,arguments,s);}else e=o.apply(this,arguments);return _possibleConstructorReturn(this,e);};}function _possibleConstructorReturn(t,e){if(e&&("object"==typeof e||"function"==typeof e))return e;if(void 0!==e)throw new TypeError("Derived constructors may only return object or undefined");return _assertThisInitialized(t);}function _assertThisInitialized(e){if(void 0===e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e;}function _wrapNativeSuper(t){var r="function"==typeof Map?new Map():void 0;return _wrapNativeSuper=function _wrapNativeSuper(t){if(null===t||!_isNativeFunction(t))return t;if("function"!=typeof t)throw new TypeError("Super expression must either be null or a function");if(void 0!==r){if(r.has(t))return r.get(t);r.set(t,Wrapper);}function Wrapper(){return _construct(t,arguments,_getPrototypeOf(this).constructor);}return Wrapper.prototype=Object.create(t.prototype,{constructor:{value:Wrapper,enumerable:!1,writable:!0,configurable:!0}}),_setPrototypeOf(Wrapper,t);},_wrapNativeSuper(t);}function _construct(t,e,r){if(_isNativeReflectConstruct())return Reflect.construct.apply(null,arguments);var o=[null];o.push.apply(o,e);var p=new(t.bind.apply(t,o))();return r&&_setPrototypeOf(p,r.prototype),p;}function _isNativeReflectConstruct(){try{var t=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}));}catch(t){}return (_isNativeReflectConstruct=function _isNativeReflectConstruct(){return !!t;})();}function _isNativeFunction(t){try{return -1!==Function.toString.call(t).indexOf("[native code]");}catch(n){return "function"==typeof t;}}function _setPrototypeOf(t,e){return _setPrototypeOf=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,e){return t.__proto__=e,t;},_setPrototypeOf(t,e);}function _getPrototypeOf(t){return _getPrototypeOf=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(t){return t.__proto__||Object.getPrototypeOf(t);},_getPrototypeOf(t);}var SVG_UTF8_RESULT_KEY='__webmscoreSvgUtf8';var svgTextDecoder=typeof TextDecoder!=='undefined'?new TextDecoder():null;var MSCORE_SCRIPT_URL$1=typeof globalThis.MSCORE_SCRIPT_URL!=='undefined'?globalThis.MSCORE_SCRIPT_URL:getSelfURL();var WorkerError=function(_Error){_inherits(WorkerError,_Error);var _super=_createSuper(WorkerError);function WorkerError(err){var _this;_classCallCheck(this,WorkerError);_this=_super.call(this);_this.name=err.name;_this.message=err.message;_this.originalStack=err.stack;return _this;}return _createClass(WorkerError);}(_wrapNativeSuper(Error));var _logLevel=0;var _resourceBaseUrl=undefined;var DEBUG_RENDER_RPC=false;var WebMscoreW=function(){function WebMscoreW(){_classCallCheck(this,WebMscoreW);var refreshStub='var $RefreshSig$ = () => (type) => type; var $RefreshReg$ = () => {};';var url=URL.createObjectURL(new Blob(["(function () { var MSCORE_SCRIPT_URL = \"".concat(MSCORE_SCRIPT_URL$1,"\";")+refreshStub+'('+shimDom.toString()+')();'+"var MSCORE_LIB_WASM = \"".concat(libWasm,"\", MSCORE_LIB_DATA = \"").concat(libData,"\", MSCORE_LIB_MEM = \"").concat(libMem,"\", MSCORE_BASEURL = \"").concat(document.baseURI,"\";")+'('+WebMscoreWorker.toString()+')()'+'})()']));this.worker=new Worker(url);this.workerURL=url;}_createClass(WebMscoreW,[{key:"rpc",value:(function(){var _rpc=_asyncToGenerator(_regeneratorRuntime().mark(function _callee(method){var _this2=this;var params,transfer,id,debugRenderRpc,debugStart,_args=arguments;return _regeneratorRuntime().wrap(function _callee$(_context){while(1)switch(_context.prev=_context.next){case 0:params=_args.length>1&&_args[1]!==undefined?_args[1]:[];transfer=_args.length>2&&_args[2]!==undefined?_args[2]:[];id=Math.random();debugRenderRpc=DEBUG_RENDER_RPC;debugStart=debugRenderRpc?Date.now():0;if(debugRenderRpc){console.info("[webmscore-rpc] ".concat(method,":start"),{id:id,params:params});}return _context.abrupt("return",new Promise(function(resolve,reject){var listener=function listener(e){var data=e.data;if(data.id===id){var result=data.result;if(method==='saveSvg'&&result&&typeof result==='object'){var encoded=result[SVG_UTF8_RESULT_KEY];if(encoded instanceof Uint8Array&&svgTextDecoder){result=svgTextDecoder.decode(encoded);}}if(debugRenderRpc){console.info("[webmscore-rpc] ".concat(method,":response"),{id:id,ms:Date.now()-debugStart,hasError:!!data.error,resultType:typeof result,resultLength:typeof result==='string'?result.length:null});}if(data.error){reject(new WorkerError(data.error));}_this2.worker.removeEventListener('message',listener);resolve(result);}};_this2.worker.addEventListener('message',listener);_this2.worker.postMessage({id:id,method:method,params:params},transfer);}));case 7:case"end":return _context.stop();}},_callee);}));function rpc(_x){return _rpc.apply(this,arguments);}return rpc;}())},{key:"setExcerptId",value:function setExcerptId(id){return this.rpc('setExcerptId',[id]);}},{key:"getExcerptId",value:function getExcerptId(){return this.rpc('getExcerptId');}},{key:"generateExcerpts",value:function generateExcerpts(){return this.rpc('generateExcerpts');}},{key:"title",value:function title(){return this.rpc('title');}},{key:"subtitle",value:function subtitle(){return this.rpc('subtitle');}},{key:"titleFilenameSafe",value:function titleFilenameSafe(){return this.rpc('titleFilenameSafe');}},{key:"setTitleText",value:function setTitleText(text){return this.rpc('setTitleText',[text]);}},{key:"setSubtitleText",value:function setSubtitleText(text){return this.rpc('setSubtitleText',[text]);}},{key:"setComposerText",value:function setComposerText(text){return this.rpc('setComposerText',[text]);}},{key:"setLyricistText",value:function setLyricistText(text){return this.rpc('setLyricistText',[text]);}},{key:"setSelectedText",value:function setSelectedText(text){return this.rpc('setSelectedText',[text]);}},{key:"layoutsAfterCommands",value:function layoutsAfterCommands(){return this.rpc('layoutsAfterCommands');}},{key:"getSystemLockState",value:function getSystemLockState(){return this.rpc('getSystemLockState');}},{key:"setSystemLock",value:function setSystemLock(locked){return this.rpc('setSystemLock',[locked]);}},{key:"moveSelectedMeasureToSystem",value:function moveSelectedMeasureToSystem(direction){return this.rpc('moveSelectedMeasureToSystem',[direction]);}},{key:"getSelectedElementProperties",value:function getSelectedElementProperties(){return this.rpc('getSelectedElementProperties');}},{key:"setSelectedElementProperty",value:function setSelectedElementProperty(propertyName,value){return this.rpc('setSelectedElementProperty',[propertyName,value]);}},{key:"addFretDiagram",value:function addFretDiagram(pattern){return this.rpc('addFretDiagram',[pattern]);}},{key:"getSelectedFretDiagram",value:function getSelectedFretDiagram(){return this.rpc('getSelectedFretDiagram');}},{key:"setSelectedFretDiagram",value:function setSelectedFretDiagram(diagram){return this.rpc('setSelectedFretDiagram',[diagram]);}},{key:"addAmbitus",value:function addAmbitus(){return this.rpc('addAmbitus');}},{key:"explodeSelection",value:function explodeSelection(){return this.rpc('explodeSelection');}},{key:"implodeSelection",value:function implodeSelection(){return this.rpc('implodeSelection');}},{key:"regroupSelection",value:function regroupSelection(){return this.rpc('regroupSelection');}},{key:"resequenceRehearsalMarks",value:function resequenceRehearsalMarks(){return this.rpc('resequenceRehearsalMarks');}},{key:"appendPart",value:function appendPart(instrumentId){return this.rpc('appendPart',[instrumentId]);}},{key:"appendPartByMusicXmlId",value:function appendPartByMusicXmlId(instrumentMusicXmlId){return this.rpc('appendPartByMusicXmlId',[instrumentMusicXmlId]);}},{key:"removePart",value:function removePart(partIndex){return this.rpc('removePart',[partIndex]);}},{key:"setPartVisible",value:function setPartVisible(partIndex,visible){return this.rpc('setPartVisible',[partIndex,visible]);}},{key:"listInstrumentTemplates",value:function listInstrumentTemplates(){return this.rpc('listInstrumentTemplates');}},{key:"npages",value:function npages(){return this.rpc('npages');}},{key:"measureSignatureCount",value:function measureSignatureCount(partIndex){return this.rpc('measureSignatureCount',[partIndex]);}},{key:"measureSignatureAt",value:function measureSignatureAt(partIndex,measureIndex){return this.rpc('measureSignatureAt',[partIndex,measureIndex]);}},{key:"measureSignatures",value:function measureSignatures(partIndex){return this.rpc('measureSignatures',[partIndex]);}},{key:"irregularMeasures",value:function irregularMeasures(){return this.rpc('irregularMeasures');}},{key:"setMeasureLengthToTimeSignature",value:function setMeasureLengthToTimeSignature(measureIndex){return this.rpc('setMeasureLengthToTimeSignature',[measureIndex]);}},{key:"measureLineBreaks",value:function measureLineBreaks(){return this.rpc('measureLineBreaks');}},{key:"setMeasureLineBreaks",value:function setMeasureLineBreaks(breaks){return this.rpc('setMeasureLineBreaks',[breaks]);}},{key:"metadata",value:function metadata(){return this.rpc('metadata');}},{key:"measurePositions",value:function measurePositions(){return this.rpc('measurePositions');}},{key:"measureRangeForPage",value:function measureRangeForPage(pageIndex){return this.rpc('measureRangeForPage',[pageIndex]);}},{key:"playbackTimeline",value:function playbackTimeline(){return this.rpc('playbackTimeline');}},{key:"selectionMeasureRange",value:function selectionMeasureRange(){return this.rpc('selectionMeasureRange');}},{key:"segmentPositions",value:function segmentPositions(){return this.rpc('segmentPositions');}},{key:"saveXml",value:function saveXml(){return this.rpc('saveXml');}},{key:"saveMxl",value:function saveMxl(){return this.rpc('saveMxl');}},{key:"saveMsc",value:function saveMsc(){var format=arguments.length>0&&arguments[0]!==undefined?arguments[0]:'mscz';return this.rpc('saveMsc',[format]);}},{key:"saveSvg",value:function saveSvg(){var pageNumber=arguments.length>0&&arguments[0]!==undefined?arguments[0]:0;var drawPageBackground=arguments.length>1&&arguments[1]!==undefined?arguments[1]:false;var highlightSelection=arguments.length>2&&arguments[2]!==undefined?arguments[2]:false;return this.rpc('saveSvg',[pageNumber,drawPageBackground,highlightSelection]);}},{key:"savePng",value:function savePng(){var pageNumber=arguments.length>0&&arguments[0]!==undefined?arguments[0]:0;var drawPageBackground=arguments.length>1&&arguments[1]!==undefined?arguments[1]:false;var transparent=arguments.length>2&&arguments[2]!==undefined?arguments[2]:true;return this.rpc('savePng',[pageNumber,drawPageBackground,transparent]);}},{key:"savePdf",value:function savePdf(){return this.rpc('savePdf');}},{key:"saveMidi",value:function saveMidi(){var midiExpandRepeats=arguments.length>0&&arguments[0]!==undefined?arguments[0]:true;var exportRPNs=arguments.length>1&&arguments[1]!==undefined?arguments[1]:true;return this.rpc('saveMidi',[midiExpandRepeats,exportRPNs]);}},{key:"setSoundFont",value:function setSoundFont(data){return this.rpc('setSoundFont',[data],[data.buffer]);}},{key:"saveAudio",value:function saveAudio(format){return this.rpc('saveAudio',[format]);}},{key:"saveAudioForMeasureRange",value:function saveAudioForMeasureRange(format,startMeasureIndex,endMeasureIndex){return this.rpc('saveAudioForMeasureRange',[format,startMeasureIndex,endMeasureIndex]);}},{key:"savePositions",value:function savePositions(ofSegments){return this.rpc('savePositions',[ofSegments]);}},{key:"synthAudio",value:(function(){var _synthAudio=_asyncToGenerator(_regeneratorRuntime().mark(function _callee2(){var _this3=this;var starttime,fnptr,_args2=arguments;return _regeneratorRuntime().wrap(function _callee2$(_context2){while(1)switch(_context2.prev=_context2.next){case 0:starttime=_args2.length>0&&_args2[0]!==undefined?_args2[0]:0;_context2.next=3;return this.rpc('_synthAudio',[starttime]);case 3:fnptr=_context2.sent;return _context2.abrupt("return",function(cancel){return _this3.rpc('processSynth',[fnptr,cancel]);});case 5:case"end":return _context2.stop();}},_callee2,this);}));function synthAudio(){return _synthAudio.apply(this,arguments);}return synthAudio;}())},{key:"synthAudioBatch",value:(function(){var _synthAudioBatch=_asyncToGenerator(_regeneratorRuntime().mark(function _callee3(starttime,batchSize){var _this4=this;var fnptr;return _regeneratorRuntime().wrap(function _callee3$(_context3){while(1)switch(_context3.prev=_context3.next){case 0:_context3.next=2;return this.rpc('_synthAudio',[starttime]);case 2:fnptr=_context3.sent;return _context3.abrupt("return",function(cancel){return _this4.rpc('processSynthBatch',[fnptr,batchSize,cancel]);});case 4:case"end":return _context3.stop();}},_callee3,this);}));function synthAudioBatch(_x2,_x3){return _synthAudioBatch.apply(this,arguments);}return synthAudioBatch;}())},{key:"synthAudioBatchFromSelection",value:(function(){var _synthAudioBatchFromSelection=_asyncToGenerator(_regeneratorRuntime().mark(function _callee4(batchSize){var _this5=this;var fnptr;return _regeneratorRuntime().wrap(function _callee4$(_context4){while(1)switch(_context4.prev=_context4.next){case 0:_context4.next=2;return this.rpc('_synthAudioFromSelection');case 2:fnptr=_context4.sent;return _context4.abrupt("return",function(cancel){return _this5.rpc('processSynthBatch',[fnptr,batchSize,cancel]);});case 4:case"end":return _context4.stop();}},_callee4,this);}));function synthAudioBatchFromSelection(_x4){return _synthAudioBatchFromSelection.apply(this,arguments);}return synthAudioBatchFromSelection;}())},{key:"synthAudioBatchForMeasureRange",value:(function(){var _synthAudioBatchForMeasureRange=_asyncToGenerator(_regeneratorRuntime().mark(function _callee5(startMeasureIndex,endMeasureIndex,batchSize){var _this6=this;var fnptr;return _regeneratorRuntime().wrap(function _callee5$(_context5){while(1)switch(_context5.prev=_context5.next){case 0:_context5.next=2;return this.rpc('_synthAudioForMeasureRange',[startMeasureIndex,endMeasureIndex]);case 2:fnptr=_context5.sent;return _context5.abrupt("return",function(cancel){return _this6.rpc('processSynthBatch',[fnptr,batchSize,cancel]);});case 4:case"end":return _context5.stop();}},_callee5,this);}));function synthAudioBatchForMeasureRange(_x5,_x6,_x7){return _synthAudioBatchForMeasureRange.apply(this,arguments);}return synthAudioBatchForMeasureRange;}())},{key:"synthSelectionPreviewBatch",value:(function(){var _synthSelectionPreviewBatch=_asyncToGenerator(_regeneratorRuntime().mark(function _callee6(batchSize){var _this7=this;var durationMs,fnptr,_args6=arguments;return _regeneratorRuntime().wrap(function _callee6$(_context6){while(1)switch(_context6.prev=_context6.next){case 0:durationMs=_args6.length>1&&_args6[1]!==undefined?_args6[1]:500;_context6.next=3;return this.rpc('_synthAudioSelectionPreview',[durationMs]);case 3:fnptr=_context6.sent;return _context6.abrupt("return",function(cancel){return _this7.rpc('processSynthBatch',[fnptr,batchSize,cancel]);});case 5:case"end":return _context6.stop();}},_callee6,this);}));function synthSelectionPreviewBatch(_x8){return _synthSelectionPreviewBatch.apply(this,arguments);}return synthSelectionPreviewBatch;}())},{key:"saveMetadata",value:function saveMetadata(){return this.rpc('saveMetadata');}},{key:"selectElementAtPoint",value:function selectElementAtPoint(pageNumber,x,y){return this.rpc('selectElementAtPoint',[pageNumber,x,y]);}},{key:"extendMeasureSelectionAtPoint",value:function extendMeasureSelectionAtPoint(pageNumber,x,y){return this.rpc('extendMeasureSelectionAtPoint',[pageNumber,x,y]);}},{key:"selectMeasureAtPoint",value:function selectMeasureAtPoint(pageNumber,x,y){return this.rpc('selectMeasureAtPoint',[pageNumber,x,y]);}},{key:"selectPartMeasureByIndex",value:function selectPartMeasureByIndex(partIndex,measureIndex){return this.rpc('selectPartMeasureByIndex',[partIndex,measureIndex]);}},{key:"selectTextElementAtPoint",value:function selectTextElementAtPoint(pageNumber,x,y){return this.rpc('selectTextElementAtPoint',[pageNumber,x,y]);}},{key:"clearSelection",value:function clearSelection(){return this.rpc('clearSelection');}},{key:"selectNextChord",value:function selectNextChord(){return this.rpc('selectNextChord');}},{key:"selectPrevChord",value:function selectPrevChord(){return this.rpc('selectPrevChord');}},{key:"extendSelectionNextChord",value:function extendSelectionNextChord(){return this.rpc('extendSelectionNextChord');}},{key:"extendSelectionPrevChord",value:function extendSelectionPrevChord(){return this.rpc('extendSelectionPrevChord');}},{key:"getUndoInfo",value:function getUndoInfo(){return this.rpc('getUndoInfo');}},{key:"getUndoEntries",value:function getUndoEntries(from,to){return this.rpc('getUndoEntries',[from,to]);}},{key:"undoRedoTo",value:function undoRedoTo(target){return this.rpc('undoRedoTo',[target]);}},{key:"isSelectionRange",value:function isSelectionRange(){return this.rpc('isSelectionRange');}},{key:"extendSelectionNextMeasure",value:function extendSelectionNextMeasure(){return this.rpc('extendSelectionNextMeasure');}},{key:"extendSelectionPrevMeasure",value:function extendSelectionPrevMeasure(){return this.rpc('extendSelectionPrevMeasure');}},{key:"extendSelectionStaffAbove",value:function extendSelectionStaffAbove(){return this.rpc('extendSelectionStaffAbove');}},{key:"extendSelectionStaffBelow",value:function extendSelectionStaffBelow(){return this.rpc('extendSelectionStaffBelow');}},{key:"getSelectionBoundingBox",value:function getSelectionBoundingBox(){return this.rpc('getSelectionBoundingBox');}},{key:"getSelectionBoundingBoxes",value:function getSelectionBoundingBoxes(){return this.rpc('getSelectionBoundingBoxes');}},{key:"setMeasureSpacer",value:function setMeasureSpacer(measureIndex,staffIdx,gapSpatium){return this.rpc('setMeasureSpacer',[measureIndex,staffIdx,gapSpatium]);}},{key:"staffSystemBands",value:function staffSystemBands(){return this.rpc('staffSystemBands');}},{key:"selectionMimeType",value:function selectionMimeType(){return this.rpc('selectionMimeType');}},{key:"selectionMimeData",value:function selectionMimeData(){return this.rpc('selectionMimeData');}},{key:"pasteSelection",value:function pasteSelection(mimeType,data){return this.rpc('pasteSelection',[mimeType,data]);}},{key:"selectElementAtPointWithMode",value:function selectElementAtPointWithMode(pageNumber,x,y,mode){return this.rpc('selectElementAtPointWithMode',[pageNumber,x,y,mode]);}},{key:"beginElementDrag",value:function beginElementDrag(pageNumber,x,y){return this.rpc('beginElementDrag',[pageNumber,x,y]);}},{key:"updateElementDrag",value:function updateElementDrag(pageNumber,x,y){var modifiers=arguments.length>3&&arguments[3]!==undefined?arguments[3]:0;var dragMode=arguments.length>4&&arguments[4]!==undefined?arguments[4]:0;return this.rpc('updateElementDrag',[pageNumber,x,y,modifiers,dragMode]);}},{key:"endElementDrag",value:function endElementDrag(commit){return this.rpc('endElementDrag',[commit]);}},{key:"applyDropAtPoint",value:function applyDropAtPoint(pageNumber,x,y,elementType,subtype){return this.rpc('applyDropAtPoint',[pageNumber,x,y,elementType,subtype]);}},{key:"beginGripEdit",value:function beginGripEdit(pageNumber,x,y){return this.rpc('beginGripEdit',[pageNumber,x,y]);}},{key:"dragGrip",value:function dragGrip(gripIndex,dx,dy){var modifiers=arguments.length>3&&arguments[3]!==undefined?arguments[3]:0;return this.rpc('dragGrip',[gripIndex,dx,dy,modifiers]);}},{key:"endGripEdit",value:function endGripEdit(commit){return this.rpc('endGripEdit',[commit]);}},{key:"getSpatium",value:function getSpatium(){return this.rpc('getSpatium');}},{key:"deleteSelection",value:function deleteSelection(){return this.rpc('deleteSelection');}},{key:"pitchUp",value:function pitchUp(){return this.rpc('pitchUp');}},{key:"pitchDown",value:function pitchDown(){return this.rpc('pitchDown');}},{key:"transpose",value:function transpose(mode,direction,key,interval,trKeys,trChordNames,useDoubleSharpsFlats){return this.rpc('transpose',[mode,direction,key,interval,trKeys,trChordNames,useDoubleSharpsFlats]);}},{key:"selectAll",value:function selectAll(){return this.rpc('selectAll');}},{key:"setAccidental",value:function setAccidental(accidentalType){return this.rpc('setAccidental',[accidentalType]);}},{key:"doubleDuration",value:function doubleDuration(){return this.rpc('doubleDuration');}},{key:"halfDuration",value:function halfDuration(){return this.rpc('halfDuration');}},{key:"toggleDot",value:function toggleDot(){return this.rpc('toggleDot');}},{key:"toggleDoubleDot",value:function toggleDoubleDot(){return this.rpc('toggleDoubleDot');}},{key:"setNoteEntryMode",value:function setNoteEntryMode(enabled){return this.rpc('setNoteEntryMode',[enabled?1:0]);}},{key:"getNoteInputCursorRect",value:function getNoteInputCursorRect(){return this.rpc('getNoteInputCursorRect');}},{key:"setNoteEntryMethod",value:function setNoteEntryMethod(method){return this.rpc('setNoteEntryMethod',[method]);}},{key:"setInputStateFromSelection",value:function setInputStateFromSelection(){return this.rpc('setInputStateFromSelection');}},{key:"setInputAccidentalType",value:function setInputAccidentalType(accidentalType){return this.rpc('setInputAccidentalType',[accidentalType]);}},{key:"setInputDurationType",value:function setInputDurationType(durationType){return this.rpc('setInputDurationType',[durationType]);}},{key:"putNote",value:function putNote(pageNumber,x,y){var replace=arguments.length>3&&arguments[3]!==undefined?arguments[3]:false;var insert=arguments.length>4&&arguments[4]!==undefined?arguments[4]:false;return this.rpc('putNote',[pageNumber,x,y,replace,insert]);}},{key:"toggleInputDot",value:function toggleInputDot(){return this.rpc('toggleInputDot');}},{key:"addPitchByStep",value:function addPitchByStep(note){var addToChord=arguments.length>1&&arguments[1]!==undefined?arguments[1]:false;var insert=arguments.length>2&&arguments[2]!==undefined?arguments[2]:false;return this.rpc('addPitchByStep',[note,addToChord?1:0,insert?1:0]);}},{key:"enterRest",value:function enterRest(){return this.rpc('enterRest');}},{key:"setDurationType",value:function setDurationType(durationType){return this.rpc('setDurationType',[durationType]);}},{key:"toggleLineBreak",value:function toggleLineBreak(){return this.rpc('toggleLineBreak');}},{key:"togglePageBreak",value:function togglePageBreak(){return this.rpc('togglePageBreak');}},{key:"setVoice",value:function setVoice(voiceIndex){return this.rpc('setVoice',[voiceIndex]);}},{key:"changeSelectedElementsVoice",value:function changeSelectedElementsVoice(voiceIndex){return this.rpc('changeSelectedElementsVoice',[voiceIndex]);}},{key:"addDynamic",value:function addDynamic(dynamicType){return this.rpc('addDynamic',[dynamicType]);}},{key:"addHairpin",value:function addHairpin(hairpinType){return this.rpc('addHairpin',[hairpinType]);}},{key:"addFermata",value:function addFermata(fermataVariant){return this.rpc('addFermata',[fermataVariant]);}},{key:"addBreath",value:function addBreath(breathType){return this.rpc('addBreath',[breathType]);}},{key:"addArpeggio",value:function addArpeggio(arpeggioType){return this.rpc('addArpeggio',[arpeggioType]);}},{key:"addTremolo",value:function addTremolo(tremoloType){return this.rpc('addTremolo',[tremoloType]);}},{key:"addOttava",value:function addOttava(ottavaType){return this.rpc('addOttava',[ottavaType]);}},{key:"addTrill",value:function addTrill(trillType){return this.rpc('addTrill',[trillType]);}},{key:"addGlissando",value:function addGlissando(glissandoType){return this.rpc('addGlissando',[glissandoType]);}},{key:"addMarker",value:function addMarker(markerType){return this.rpc('addMarker',[markerType]);}},{key:"addJump",value:function addJump(jumpType){return this.rpc('addJump',[jumpType]);}},{key:"setNoteheadGroup",value:function setNoteheadGroup(noteheadGroup){return this.rpc('setNoteheadGroup',[noteheadGroup]);}},{key:"setBeamMode",value:function setBeamMode(beamMode){return this.rpc('setBeamMode',[beamMode]);}},{key:"setSelectionFilter",value:function setSelectionFilter(filterMask){return this.rpc('setSelectionFilter',[filterMask]);}},{key:"addMeasureRepeat",value:function addMeasureRepeat(numMeasures){return this.rpc('addMeasureRepeat',[numMeasures]);}},{key:"setMultiMeasureRests",value:function setMultiMeasureRests(enabled){return this.rpc('setMultiMeasureRests',[enabled]);}},{key:"multiMeasureRestsEnabled",value:function multiMeasureRestsEnabled(){return this.rpc('multiMeasureRestsEnabled');}},{key:"addPedal",value:function addPedal(pedalVariant){return this.rpc('addPedal',[pedalVariant]);}},{key:"addSostenutoPedal",value:function addSostenutoPedal(){return this.rpc('addSostenutoPedal');}},{key:"addUnaCorda",value:function addUnaCorda(){return this.rpc('addUnaCorda');}},{key:"splitPedal",value:function splitPedal(){return this.rpc('splitPedal');}},{key:"addRehearsalMark",value:function addRehearsalMark(){return this.rpc('addRehearsalMark');}},{key:"addTempoText",value:function addTempoText(bpm){return this.rpc('addTempoText',[bpm]);}},{key:"addStaffText",value:function addStaffText(text){return this.rpc('addStaffText',[text]);}},{key:"addSystemText",value:function addSystemText(text){return this.rpc('addSystemText',[text]);}},{key:"addExpressionText",value:function addExpressionText(text){return this.rpc('addExpressionText',[text]);}},{key:"addLyricText",value:function addLyricText(text){return this.rpc('addLyricText',[text]);}},{key:"addHarmonyText",value:function addHarmonyText(variant,text){return this.rpc('addHarmonyText',[variant,text]);}},{key:"addFingeringText",value:function addFingeringText(text){return this.rpc('addFingeringText',[text]);}},{key:"addLeftHandGuitarFingeringText",value:function addLeftHandGuitarFingeringText(text){return this.rpc('addLeftHandGuitarFingeringText',[text]);}},{key:"addRightHandGuitarFingeringText",value:function addRightHandGuitarFingeringText(text){return this.rpc('addRightHandGuitarFingeringText',[text]);}},{key:"addStringNumberText",value:function addStringNumberText(text){return this.rpc('addStringNumberText',[text]);}},{key:"addInstrumentChangeText",value:function addInstrumentChangeText(text){return this.rpc('addInstrumentChangeText',[text]);}},{key:"addStickingText",value:function addStickingText(text){return this.rpc('addStickingText',[text]);}},{key:"addFiguredBassText",value:function addFiguredBassText(text){return this.rpc('addFiguredBassText',[text]);}},{key:"addArticulation",value:function addArticulation(articulationSymbolName){return this.rpc('addArticulation',[articulationSymbolName]);}},{key:"flipStem",value:function flipStem(){return this.rpc('flipStem');}},{key:"addSlur",value:function addSlur(){return this.rpc('addSlur');}},{key:"addTie",value:function addTie(){return this.rpc('addTie');}},{key:"addGraceNote",value:function addGraceNote(graceType){return this.rpc('addGraceNote',[graceType]);}},{key:"addTuplet",value:function addTuplet(tupletCount){return this.rpc('addTuplet',[tupletCount]);}},{key:"addNoteFromRest",value:function addNoteFromRest(){return this.rpc('addNoteFromRest');}},{key:"toggleRepeatStart",value:function toggleRepeatStart(){return this.rpc('toggleRepeatStart');}},{key:"toggleRepeatEnd",value:function toggleRepeatEnd(){return this.rpc('toggleRepeatEnd');}},{key:"setRepeatCount",value:function setRepeatCount(count){return this.rpc('setRepeatCount',[count]);}},{key:"setBarLineType",value:function setBarLineType(barLineType){return this.rpc('setBarLineType',[barLineType]);}},{key:"addVolta",value:function addVolta(endingNumber){return this.rpc('addVolta',[endingNumber]);}},{key:"insertMeasures",value:function insertMeasures(count,target){return this.rpc('insertMeasures',[count,target]);}},{key:"addPickupMeasure",value:function addPickupMeasure(numerator,denominator){return this.rpc('addPickupMeasure',[numerator,denominator]);}},{key:"removeTrailingEmptyMeasures",value:function removeTrailingEmptyMeasures(){return this.rpc('removeTrailingEmptyMeasures');}},{key:"removeSelectedMeasures",value:function removeSelectedMeasures(){return this.rpc('removeSelectedMeasures');}},{key:"undo",value:function undo(){return this.rpc('undo');}},{key:"redo",value:function redo(){return this.rpc('redo');}},{key:"relayout",value:function relayout(){return this.rpc('relayout');}},{key:"loadProfile",value:function loadProfile(){return this.rpc('loadProfile');}},{key:"layoutUntilPage",value:function layoutUntilPage(){var pageNumber=arguments.length>0&&arguments[0]!==undefined?arguments[0]:0;return this.rpc('layoutUntilPage',[pageNumber]);}},{key:"layoutUntilPageState",value:function layoutUntilPageState(){var pageNumber=arguments.length>0&&arguments[0]!==undefined?arguments[0]:0;return this.rpc('layoutUntilPageState',[pageNumber]);}},{key:"setLayoutMode",value:function setLayoutMode(layoutMode){return this.rpc('setLayoutMode',[layoutMode]);}},{key:"getLayoutMode",value:function getLayoutMode(){return this.rpc('getLayoutMode');}},{key:"setTimeSignature",value:function setTimeSignature(numerator,denominator){return this.rpc('setTimeSignature',[numerator,denominator]);}},{key:"setTimeSignatureWithType",value:function setTimeSignatureWithType(numerator,denominator,timeSigType){return this.rpc('setTimeSignatureWithType',[numerator,denominator,timeSigType]);}},{key:"setKeySignature",value:function setKeySignature(fifths){return this.rpc('setKeySignature',[fifths]);}},{key:"setHarmonyVoiceLiteral",value:function setHarmonyVoiceLiteral(literal){return this.rpc('setHarmonyVoiceLiteral',[literal]);}},{key:"setChordSymbolStylePreset",value:function setChordSymbolStylePreset(preset){return this.rpc('setChordSymbolStylePreset',[preset]);}},{key:"getKeySignature",value:function getKeySignature(){return this.rpc('getKeySignature');}},{key:"setClef",value:function setClef(clefType){return this.rpc('setClef',[clefType]);}},{key:"destroy",value:function destroy(){var soft=arguments.length>0&&arguments[0]!==undefined?arguments[0]:true;if(soft){this.rpc('destroy',[soft]);}else {this.worker.terminate();URL.revokeObjectURL(this.workerURL);}}}],[{key:"ready",get:function get(){return Promise.resolve();}},{key:"version",value:(function(){var _version=_asyncToGenerator(_regeneratorRuntime().mark(function _callee7(){return _regeneratorRuntime().wrap(function _callee7$(_context7){while(1)switch(_context7.prev=_context7.next){case 0:return _context7.abrupt("return",-1);case 1:case"end":return _context7.stop();}},_callee7);}));function version(){return _version.apply(this,arguments);}return version;}())},{key:"setLogLevel",value:(function(){var _setLogLevel=_asyncToGenerator(_regeneratorRuntime().mark(function _callee8(level){return _regeneratorRuntime().wrap(function _callee8$(_context8){while(1)switch(_context8.prev=_context8.next){case 0:_logLevel=level;case 1:case"end":return _context8.stop();}},_callee8);}));function setLogLevel(_x9){return _setLogLevel.apply(this,arguments);}return setLogLevel;}())},{key:"resourceBaseUrl",get:function get(){return _resourceBaseUrl;},set:function set(url){var _globalThis$location;_resourceBaseUrl=url?new URL(url,(_globalThis$location=globalThis.location)===null||_globalThis$location===void 0?void 0:_globalThis$location.href).href:undefined;}},{key:"load",value:(function(){var _load=_asyncToGenerator(_regeneratorRuntime().mark(function _callee9(format,data){var fonts,doLayout,instance,_yield$Promise$all,_yield$Promise$all2,_fonts,capabilities,_i,_arr,name,_args9=arguments;return _regeneratorRuntime().wrap(function _callee9$(_context9){while(1)switch(_context9.prev=_context9.next){case 0:fonts=_args9.length>2&&_args9[2]!==undefined?_args9[2]:[];doLayout=_args9.length>3&&_args9[3]!==undefined?_args9[3]:true;instance=new WebMscoreW();_context9.next=5;return Promise.all([fonts,instance.rpc('ready')]);case 5:_yield$Promise$all=_context9.sent;_yield$Promise$all2=_slicedToArray(_yield$Promise$all,1);_fonts=_yield$Promise$all2[0];_context9.next=10;return instance.rpc('setLogLevel',[_logLevel]);case 10:if(!_resourceBaseUrl){_context9.next=13;break;}_context9.next=13;return instance.rpc('setResourceBaseUrl',[_resourceBaseUrl]);case 13:_context9.next=15;return instance.rpc('load',[format,data,_fonts,doLayout],[data.buffer].concat(_toConsumableArray(_fonts.map(function(f){return f.buffer;}))));case 15:capabilities=_context9.sent;if(!(capabilities!==null&&capabilities!==void 0&&capabilities.systemLocks)){for(_i=0,_arr=['getSystemLockState','setSystemLock','moveSelectedMeasureToSystem'];_i<_arr.length;_i++){name=_arr[_i];Object.defineProperty(instance,name,{value:undefined});}}return _context9.abrupt("return",instance);case 18:case"end":return _context9.stop();}},_callee9);}));function load(_x0,_x1){return _load.apply(this,arguments);}return load;}())}]);return WebMscoreW;}();

export { WebMscoreW as default };
