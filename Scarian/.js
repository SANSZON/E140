const faceDef = faces[f];
let tex, color=null;
if(faceDef && faceDef.tex){
  tex = faceDef.tex;
  color = faceDef.color;
}else{
  tex = faceDef;
}
const mat = getMat(tex, color);