// Product facts mirror the existing 2D BAG_MODELS/BAG_OPT_CONF and original PNGs.
// A flat product has no sewn bottom gusset; depth only opens its mouth in preview.
export const SAMPLE_PRODUCT_ID = 'sample-two-line-large';
export const TWO_TONE_SMALL_PRODUCT_ID = 'sample-two-line-small';
export const TWO_TONE_KIDS_PRODUCT_ID = 'two-tone-kids';
export const DAILY_PRODUCT_ID = 'daily';
export const POLY_BODY_COLOR_PRESETS = Object.freeze([
  { name: '블랙', hex: '#1a1a1a' }, { name: '네이비', hex: '#1a2a4a' }, { name: '그린', hex: '#104727' },
].map(preset => Object.freeze(preset)));
const ecobagOptions = ['innerPocket', 'innerPocketPrint', 'snap', 'magnet', 'zipper', 'crossStrap', 'nameTag', 'individualPackaging', 'doubleSided'];
const pouchOptions = ['zipper', 'individualPackaging', 'doubleSided'];
const polyOptions = ['innerPocketPrint', 'crossStrap', 'nameTag', 'individualPackaging', 'doubleSided'];
const handle = (drop, gap, width = 30, color = '#ece6d9') => ({ width, thickness: 2, drop, gap, color });
// Measurements use the original body/handle cutouts on the same pixel frame.
// Roll angles infer the width projection in one photo; they are visual estimates.
const HANDLES_FROM_PHOTOS = {
  small: {
    width: 38, drop: 111, gap: 120,
    handleDrape: {"leftRollDeg":38.8,"rightRollDeg":35.9,"crownRollDeg":35.6,"leftRollKnots":[[0,0],[0.05,28.5],[0.1,30.2],[0.2,34.1],[0.3,37.1],[0.4,38],[0.5,38.8],[0.6,43.7],[0.8,35.9],[0.9,33],[1,35.6]],"rightRollKnots":[[0,0],[0.05,17.3],[0.1,22.5],[0.2,27.4],[0.3,30.6],[0.4,32.2],[0.5,35.9],[0.6,41.3],[0.8,34.6],[0.9,33],[1,35.6]],"centerlineKnots":[[-1,0],[-0.9905,0.06],[-0.9835,0.1201],[-0.9768,0.1802],[-0.9709,0.2404],[-0.9656,0.3005],[-0.9604,0.3607],[-0.9541,0.4208],[-0.9456,0.4809],[-0.9349,0.5408],[-0.9227,0.6007],[-0.8579,0.6387],[-0.818,0.695],[-0.7674,0.7475],[-0.6641,0.7709],[-0.5593,0.7925],[-0.4546,0.8142],[-0.3478,0.8327],[-0.2385,0.8462],[-0.1268,0.8514],[-0.0147,0.8545],[0.0974,0.8557],[0.2092,0.8527],[0.3196,0.8422],[0.4249,0.8214],[0.5313,0.8021],[0.638,0.7835],[0.728,0.7525],[0.7719,0.697],[0.8148,0.6414],[0.8748,0.5982],[0.8938,0.5388],[0.9105,0.4793],[0.924,0.4195],[0.9366,0.3597],[0.9488,0.2998],[0.961,0.24],[0.9724,0.18],[0.9825,0.1201],[0.9929,0.0601],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":111.38,"anchorGapMm":119.55,"anchorCenterOffsetMm":1.64,"bodySizeMm":[200,220],"bodyBoundsPx":{"x":136,"y":409,"width":578,"height":638},"handleBoundsPx":{"x":206,"y":86,"width":452,"height":329},"centerlineSamples":[[0.05,-0.9942,0.9971],[0.1,-0.9884,0.9884],[0.2,-0.9768,0.9711],[0.3,-0.9682,0.9508],[0.4,-0.9595,0.9305],[0.5,-0.945,0.9074],[0.6,-0.9247,0.8755]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.8557,"crownSilhouetteSamples":[[-0.7,0.8947,0.418],[-0.6,0.9443,0.6966],[-0.5,0.9721,0.6997],[-0.4,0.9845,0.7028],[-0.3,0.9907,0.7059],[-0.2,0.9938,0.709],[-0.1,0.9969,0.7121],[0,1,0.7152],[0.1,1,0.7152],[0.2,1,0.7152],[0.3,1,0.7152],[0.4,0.9969,0.7152],[0.5,0.9845,0.7152],[0.6,0.9412,0.7152],[0.7,0.8854,0]],"crownProjectedWidthMm":32.07,"crownWidthBasis":"apex-column-photo-scale","crownRollBasis":"width*cos(angle)+2mm*sin(angle)"},
  },
  sgak_s: {
    width: 38, drop: 237, gap: 140,
    handleDrape: {"leftRollDeg":39.2,"rightRollDeg":33,"crownRollDeg":84.1,"leftRollKnots":[[0,0],[0.05,0],[0.1,0],[0.2,17.3],[0.3,26.8],[0.4,31.3],[0.5,39.2],[0.6,45.2],[0.7,48.7],[0.8,53.3],[0.9,63.7],[1,84.1]],"rightRollKnots":[[0,0],[0.05,14.1],[0.1,14.1],[0.2,22.5],[0.3,27],[0.4,31.1],[0.5,33],[0.6,35.7],[0.7,43.8],[0.8,57.5],[0.9,68.8],[1,84.1]],"centerlineKnots":[[-1,0],[-0.9821,0.0532],[-0.9684,0.1064],[-0.9499,0.1595],[-0.9298,0.2126],[-0.9034,0.2655],[-0.8767,0.3183],[-0.8491,0.3711],[-0.8189,0.4237],[-0.7849,0.4762],[-0.7488,0.5285],[-0.7105,0.5807],[-0.6696,0.6328],[-0.6269,0.6847],[-0.5809,0.7363],[-0.5335,0.7879],[-0.4799,0.8389],[-0.4242,0.8897],[-0.3452,0.9363],[-0.2201,0.9743],[-0.0492,0.9881],[0.1089,0.9641],[0.2242,0.923],[0.3288,0.8802],[0.4161,0.8334],[0.4933,0.7853],[0.5478,0.7344],[0.5982,0.6831],[0.6409,0.6312],[0.6838,0.5793],[0.7271,0.5275],[0.7675,0.4754],[0.8052,0.4232],[0.8399,0.3708],[0.8726,0.3182],[0.8983,0.2654],[0.9207,0.2124],[0.9411,0.1593],[0.9609,0.1062],[0.9819,0.0531],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":236.61,"anchorGapMm":138.89,"anchorCenterOffsetMm":-3.41,"bodySizeMm":[290,330],"bodyBoundsPx":{"x":145,"y":711,"width":830,"height":947},"handleBoundsPx":{"x":295,"y":32,"width":511,"height":684},"centerlineSamples":[[0.05,-0.9899,0.9925],[0.1,-0.9774,0.9723],[0.2,-0.9421,0.9346],[0.3,-0.8918,0.8918],[0.4,-0.839,0.8289],[0.5,-0.7736,0.756],[0.6,-0.7006,0.673],[0.7,-0.6176,0.5899],[0.8,-0.5245,0.4818],[0.9,-0.4138,0.2931]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9881,"crownSilhouetteSamples":[[-0.7,0.7879,0.0928],[-0.6,0.8645,0.3947],[-0.5,0.9234,0.5965],[-0.4,0.9617,0.7378],[-0.3,0.9823,0.8763],[-0.2,0.9941,0.9514],[-0.1,0.9985,0.9764],[0,0.9985,0.9705],[0.1,0.9838,0.9381],[0.2,0.9632,0.8851],[0.3,0.9352,0.8159],[0.4,0.9028,0.6686],[0.5,0.8586,0.5155],[0.6,0.8174,0.377],[0.7,0.7614,0.0972]],"crownProjectedWidthMm":5.92,"crownWidthBasis":"apex-column-photo-scale","crownRollBasis":"width*cos(angle)+2mm*sin(angle)"},
  },
  kids: {
    width: 38, drop: 215, gap: 146,
    handleDrape: {"leftRollDeg":52.6,"rightRollDeg":59.8,"crownRollDeg":70.6,"leftRollKnots":[[0,0],[0.05,4.6],[0.1,0],[0.2,12],[0.3,25.8],[0.4,41.4],[0.5,52.6],[0.6,60.5],[0.7,68.1],[0.8,76],[0.9,80],[1,70.6]],"rightRollKnots":[[0,0],[0.05,27.7],[0.1,31.9],[0.2,44.9],[0.3,49.5],[0.4,53.8],[0.5,59.8],[0.6,63.1],[0.7,71],[0.8,77],[0.9,75.5],[1,70.6]],"centerlineKnots":[[-1,0],[-0.9991,0.0548],[-0.9866,0.1094],[-0.9772,0.1641],[-0.9665,0.2187],[-0.9533,0.2733],[-0.9344,0.3277],[-0.9095,0.3819],[-0.8744,0.4353],[-0.8334,0.4883],[-0.7849,0.5405],[-0.7338,0.5925],[-0.6804,0.6442],[-0.6266,0.6959],[-0.5671,0.7468],[-0.5068,0.7976],[-0.428,0.8454],[-0.3473,0.8929],[-0.2403,0.9321],[-0.0975,0.9572],[0.0621,0.9653],[0.2196,0.9539],[0.363,0.9288],[0.4614,0.896],[0.5578,0.852],[0.6542,0.808],[0.7106,0.757],[0.761,0.7049],[0.7992,0.6517],[0.8362,0.5984],[0.8653,0.5445],[0.8941,0.4906],[0.9216,0.4366],[0.9467,0.3825],[0.9678,0.3281],[0.9848,0.2737],[0.9981,0.2191],[1.0015,0.1644],[1.0002,0.1096],[1,0.0548],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":215.16,"anchorGapMm":145.68,"anchorCenterOffsetMm":-0.35,"bodySizeMm":[330,330],"bodyBoundsPx":{"x":130,"y":717,"width":931,"height":931},"handleBoundsPx":{"x":336,"y":110,"width":512,"height":607},"centerlineSamples":[[0.05,-1,1],[0.1,-0.9878,1],[0.2,-0.9708,1.0024],[0.3,-0.9465,0.9781],[0.4,-0.9002,0.9392],[0.5,-0.8224,0.8881],[0.6,-0.7251,0.8345],[0.7,-0.6204,0.764],[0.8,-0.5012,0.6667],[0.9,-0.3333,0.4501]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9653,"crownSilhouetteSamples":[[-0.7,0.7166,0.4102],[-0.6,0.7809,0.5865],[-0.5,0.8451,0.7249],[-0.4,0.8995,0.8369],[-0.3,0.9423,0.8929],[-0.2,0.9736,0.916],[-0.1,0.9918,0.9292],[0,1,0.9341],[0.1,1,0.9325],[0.2,0.9918,0.9226],[0.3,0.9769,0.9094],[0.4,0.9539,0.8913],[0.5,0.9242,0.8666],[0.6,0.8814,0.8056],[0.7,0.8254,0.6474]],"crownProjectedWidthMm":14.53,"crownWidthBasis":"apex-column-photo-scale","crownRollBasis":"width*cos(angle)+2mm*sin(angle)"},
  },
  sgak_m: {
    width: 38, drop: 266, gap: 145,
    handleDrape: {"leftRollDeg":33.9,"rightRollDeg":32.9,"crownRollDeg":88,"leftRollKnots":[[0,0],[0.05,0],[0.1,15.6],[0.2,26.6],[0.3,28.9],[0.4,25.4],[0.5,33.9],[0.6,46.1],[0.7,56],[0.8,65.2],[0.9,70.8],[1,88]],"rightRollKnots":[[0,0],[0.05,40.6],[0.1,43],[0.2,38.3],[0.3,36.2],[0.4,32.2],[0.5,32.9],[0.6,47.1],[0.7,59.6],[0.8,69.3],[0.9,71.2],[1,88]],"centerlineKnots":[[-1,0],[-0.9856,0.0507],[-0.966,0.1012],[-0.9367,0.1515],[-0.9073,0.2017],[-0.8606,0.2509],[-0.8139,0.3001],[-0.7618,0.349],[-0.7095,0.3978],[-0.6593,0.4468],[-0.6092,0.4958],[-0.5656,0.5452],[-0.5229,0.5948],[-0.4776,0.6441],[-0.432,0.6934],[-0.3845,0.7426],[-0.3367,0.7918],[-0.2826,0.8404],[-0.2271,0.889],[-0.1444,0.9342],[-0.0124,0.9658],[0.1122,0.9327],[0.167,0.8843],[0.2034,0.8345],[0.2371,0.7845],[0.2652,0.7342],[0.2981,0.6842],[0.3402,0.6346],[0.3882,0.5855],[0.4488,0.5374],[0.5077,0.4891],[0.5621,0.4405],[0.6168,0.3918],[0.6723,0.3433],[0.7279,0.2947],[0.7834,0.2461],[0.839,0.1976],[0.8956,0.1491],[0.9519,0.1006],[0.988,0.0507],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":266.06,"anchorGapMm":144.84,"anchorCenterOffsetMm":-2.03,"bodySizeMm":[330,360],"bodyBoundsPx":{"x":105,"y":787,"width":933,"height":1027},"handleBoundsPx":{"x":305,"y":28,"width":511,"height":758},"centerlineSamples":[[0.05,-0.9878,0.9902],[0.1,-0.9683,0.9536],[0.2,-0.9096,0.8364],[0.3,-0.8144,0.7216],[0.4,-0.707,0.6068],[0.5,-0.6044,0.4945],[0.6,-0.5189,0.37],[0.7,-0.4261,0.2845],[0.8,-0.3284,0.2283],[0.9,-0.2137,0.1551]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9658,"crownSilhouetteSamples":[[-0.7,0.6021,0.1318],[-0.6,0.6838,0.2806],[-0.5,0.7549,0.3663],[-0.4,0.8314,0.4835],[-0.3,0.9012,0.6614],[-0.2,0.9433,0.9433],[-0.1,0.975,0.9223],[0,0.9934,0.9328],[0.1,0.9908,0.8762],[0.2,0.9394,0.9328],[0.3,0.8353,0.8287],[0.4,0.7167,0.7128],[0.5,0.6456,0.6456],[0.6,0.5863,0.585],[0.7,0.5178,0.498]]},
  },
  daily: {
    width: 34, drop: 269, gap: 146,
    handleDrape: {"leftRollDeg":50.4,"rightRollDeg":35.4,"crownRollDeg":88,"leftRollKnots":[[0,0],[0.05,22],[0.1,27],[0.2,24.3],[0.3,33.5],[0.4,42.6],[0.5,50.4],[0.6,54.4],[0.7,62.5],[0.8,69.9],[0.9,77.4],[1,88]],"rightRollKnots":[[0,0],[0.05,20.9],[0.1,19.2],[0.2,22.4],[0.3,23.9],[0.4,27.8],[0.5,35.4],[0.6,42.6],[0.7,49.8],[0.8,59.5],[0.9,71.7],[1,88]],"centerlineKnots":[[-1,0],[-0.9834,0.0505],[-0.9529,0.1006],[-0.9171,0.1504],[-0.881,0.2001],[-0.8399,0.2496],[-0.7987,0.2991],[-0.7517,0.3482],[-0.7044,0.3972],[-0.6576,0.4463],[-0.6109,0.4954],[-0.5651,0.5446],[-0.5194,0.5938],[-0.4724,0.6428],[-0.4251,0.6919],[-0.3756,0.7408],[-0.3256,0.7897],[-0.2735,0.8384],[-0.2207,0.887],[-0.1686,0.9356],[-0.0537,0.9674],[0.0374,0.926],[0.103,0.8793],[0.1621,0.8312],[0.219,0.7829],[0.2722,0.7343],[0.3246,0.6856],[0.3752,0.6368],[0.4263,0.588],[0.4784,0.5393],[0.5308,0.4907],[0.584,0.442],[0.6365,0.3934],[0.6849,0.3444],[0.7333,0.2954],[0.7811,0.2464],[0.8287,0.1973],[0.8726,0.148],[0.917,0.0988],[0.9672,0.0499],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":269.3,"anchorGapMm":144.31,"anchorCenterOffsetMm":1.65,"bodySizeMm":[360,360],"bodyBoundsPx":{"x":118,"y":862,"width":1034,"height":1024},"handleBoundsPx":{"x":380,"y":96,"width":523,"height":770},"centerlineSamples":[[0.05,-0.9879,0.9783],[0.1,-0.9566,0.9252],[0.2,-0.8842,0.8359],[0.3,-0.7998,0.737],[0.4,-0.7033,0.6381],[0.5,-0.6068,0.5271],[0.6,-0.5127,0.4186],[0.7,-0.4162,0.3148],[0.8,-0.3124,0.2039],[0.9,-0.2039,0.0808]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9674,"crownSilhouetteSamples":[[-0.7,0.5561,0.1593],[-0.6,0.6436,0.2937],[-0.5,0.7232,0.4334],[-0.4,0.7963,0.5692],[-0.3,0.8695,0.7089],[-0.2,0.9465,0.8499],[-0.1,1,0.9478],[0,0.9804,0.9021],[0.1,0.9321,0.7676],[0.2,0.8734,0.641],[0.3,0.8133,0.5287],[0.4,0.7467,0.4204],[0.5,0.6684,0.312],[0.6,0.5914,0.2023],[0.7,0.5131,0.094]]},
  },
  market: {
    width: 38, drop: 253, gap: 165,
    handleDrape: {"leftRollDeg":50.9,"rightRollDeg":54,"crownRollDeg":88,"leftRollKnots":[[0,0],[0.05,22.3],[0.1,32.5],[0.2,43.5],[0.3,40.3],[0.4,44.2],[0.5,50.9],[0.6,57],[0.7,64.3],[0.8,69.6],[0.9,76.6],[1,88]],"rightRollKnots":[[0,0],[0.05,0],[0.1,13.9],[0.2,32.4],[0.3,42.4],[0.4,50.8],[0.5,54],[0.6,59.4],[0.7,62.8],[0.8,68.2],[0.9,73.7],[1,88]],"centerlineKnots":[[-1,0],[-0.9705,0.0509],[-0.9463,0.102],[-0.9113,0.1525],[-0.8758,0.2029],[-0.8234,0.2519],[-0.7711,0.3008],[-0.7208,0.35],[-0.6706,0.3992],[-0.6204,0.4484],[-0.5702,0.4976],[-0.5171,0.5465],[-0.4638,0.5953],[-0.4089,0.644],[-0.3538,0.6926],[-0.2967,0.7411],[-0.2391,0.7894],[-0.1836,0.838],[-0.1287,0.8867],[-0.0725,0.9347],[0.0284,0.9732],[0.1249,0.9405],[0.1833,0.8926],[0.2382,0.8439],[0.2929,0.7952],[0.3468,0.7465],[0.4002,0.6976],[0.4479,0.6482],[0.4958,0.5988],[0.5473,0.5497],[0.5987,0.5007],[0.648,0.4514],[0.6972,0.4021],[0.7408,0.3523],[0.7842,0.3024],[0.8242,0.2523],[0.8642,0.2022],[0.9022,0.1519],[0.9401,0.1016],[0.9726,0.051],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":253.4,"anchorGapMm":163.21,"anchorCenterOffsetMm":-0.52,"bodySizeMm":[430,300],"bodyBoundsPx":{"x":64,"y":895,"width":1233,"height":882},"handleBoundsPx":{"x":384,"y":150,"width":591,"height":748},"centerlineSamples":[[0.05,-0.985,0.9808],[0.1,-0.9615,0.9487],[0.2,-0.891,0.8718],[0.3,-0.7821,0.7906],[0.4,-0.6795,0.703],[0.5,-0.5769,0.6026],[0.6,-0.4658,0.4957],[0.7,-0.3504,0.3974],[0.8,-0.2308,0.2863],[0.9,-0.1175,0.1731]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9732,"crownSilhouetteSamples":[[-0.7,0.5168,0.204],[-0.6,0.5906,0.2859],[-0.5,0.6685,0.396],[-0.4,0.7396,0.5181],[-0.3,0.8081,0.6295],[-0.2,0.8779,0.7396],[-0.1,0.949,0.843],[0,0.9893,0.9503],[0.1,0.9906,0.9087],[0.2,0.9302,0.796],[0.3,0.8591,0.6846],[0.4,0.7839,0.5664],[0.5,0.706,0.4523],[0.6,0.6174,0.3852],[0.7,0.5329,0.1329]]},
  },
  sgak_l: {
    width: 38, drop: 313, gap: 145,
    handleDrape: {"leftRollDeg":36.3,"rightRollDeg":33.5,"crownRollDeg":88,"leftRollKnots":[[0,0],[0.05,0],[0.1,16.8],[0.2,24.4],[0.3,29.8],[0.4,27.4],[0.5,36.3],[0.6,46.6],[0.7,56.5],[0.8,65.9],[0.9,70.4],[1,88]],"rightRollKnots":[[0,0],[0.05,39.2],[0.1,42.1],[0.2,37.1],[0.3,33.5],[0.4,31.8],[0.5,33.5],[0.6,40.8],[0.7,59.3],[0.8,69.8],[0.9,71],[1,88]],"centerlineKnots":[[-1,0],[-0.9854,0.0501],[-0.9661,0.1001],[-0.9383,0.1499],[-0.9103,0.1997],[-0.8637,0.2487],[-0.8163,0.2978],[-0.7652,0.3466],[-0.7138,0.3954],[-0.6644,0.4443],[-0.6153,0.4932],[-0.571,0.5424],[-0.5276,0.5916],[-0.4824,0.6407],[-0.4367,0.6898],[-0.3889,0.7388],[-0.3404,0.7877],[-0.2873,0.8364],[-0.2326,0.8851],[-0.1518,0.931],[-0.0097,0.9648],[0.1131,0.9296],[0.1715,0.8816],[0.2055,0.832],[0.2379,0.7823],[0.2675,0.7326],[0.3048,0.6832],[0.3551,0.6343],[0.4057,0.5855],[0.4571,0.5367],[0.5096,0.4879],[0.5655,0.4394],[0.6214,0.3909],[0.6772,0.3423],[0.733,0.2938],[0.7883,0.2452],[0.844,0.1966],[0.902,0.1482],[0.9593,0.0998],[0.9927,0.0502],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":312.68,"anchorGapMm":144.67,"anchorCenterOffsetMm":-1.86,"bodySizeMm":[360,400],"bodyBoundsPx":{"x":131,"y":940,"width":1014,"height":1136},"handleBoundsPx":{"x":373,"y":52,"width":724,"height":888},"centerlineSamples":[[0.05,-0.9853,0.9926],[0.1,-0.9656,0.9583],[0.2,-0.9092,0.838],[0.3,-0.8135,0.7252],[0.4,-0.708,0.6098],[0.5,-0.6074,0.4945],[0.6,-0.519,0.389],[0.7,-0.4258,0.2859],[0.8,-0.3276,0.227],[0.9,-0.2147,0.1583]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9648,"crownSilhouetteSamples":[[-0.7,0.6036,0.134],[-0.6,0.6813,0.2782],[-0.5,0.7556,0.3671],[-0.4,0.8288,0.4786],[-0.3,0.9032,0.6667],[-0.2,0.9448,0.9426],[-0.1,0.9752,0.9167],[0,0.9944,0.9336],[0.1,0.991,0.8761],[0.2,0.9403,0.9381],[0.3,0.8345,0.8288],[0.4,0.723,0.7218],[0.5,0.6408,0.6374],[0.6,0.5867,0.5856],[0.7,0.5214,0.5]]},
  },
  tumbler: {
    width: 20, drop: 105, gap: 158,
    handleDrape: {"leftRollDeg":36.1,"rightRollDeg":41.5,"crownRollDeg":76,"leftRollKnots":[[0,0],[0.05,57.9],[0.1,54],[0.2,44],[0.3,36.1],[0.4,34.6],[0.5,36.1],[0.6,43],[0.7,46.5],[0.8,48.6],[0.9,56],[1,76]],"rightRollKnots":[[0,0],[0.05,48.6],[0.1,43.8],[0.2,37.9],[0.3,33.1],[0.4,37.5],[0.5,41.5],[0.6,45.3],[0.7,47.6],[0.8,53.1],[0.9,64.4],[1,76]],"centerlineKnots":[[-1,0],[-0.9536,0.0519],[-0.9067,0.1035],[-0.8593,0.1548],[-0.8119,0.2062],[-0.7661,0.2584],[-0.72,0.3104],[-0.6723,0.3616],[-0.6246,0.4128],[-0.5769,0.4641],[-0.5297,0.5155],[-0.4839,0.5676],[-0.4378,0.6196],[-0.3911,0.6714],[-0.3447,0.7232],[-0.2986,0.7752],[-0.2521,0.8271],[-0.2052,0.8787],[-0.1489,0.9233],[-0.0828,0.9617],[-0.0011,0.9736],[0.0803,0.9585],[0.145,0.919],[0.2059,0.8772],[0.2607,0.83],[0.3137,0.7817],[0.3644,0.732],[0.4137,0.6816],[0.4611,0.6303],[0.5078,0.5785],[0.5536,0.5264],[0.5996,0.4743],[0.6457,0.4223],[0.6907,0.3698],[0.7351,0.317],[0.7806,0.2647],[0.8264,0.2126],[0.8729,0.1608],[0.9196,0.1091],[0.962,0.0554],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":104.99,"anchorGapMm":155.21,"anchorCenterOffsetMm":0.62,"bodySizeMm":[190,200],"bodyBoundsPx":{"x":154,"y":341,"width":538,"height":581},"handleBoundsPx":{"x":184,"y":36,"width":485,"height":308},"centerlineSamples":[[0.05,-0.9727,0.9795],[0.1,-0.9272,0.9408],[0.2,-0.8316,0.8476],[0.3,-0.7406,0.7565],[0.4,-0.6473,0.6724],[0.5,-0.554,0.5836],[0.6,-0.463,0.4926],[0.7,-0.3697,0.397],[0.8,-0.281,0.2947],[0.9,-0.19,0.1786]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9736,"crownSilhouetteSamples":[[-0.7,0.4656,0.2098],[-0.6,0.5672,0.3082],[-0.5,0.6689,0.4098],[-0.4,0.777,0.5279],[-0.3,0.8787,0.6492],[-0.2,0.9541,0.7738],[-0.1,0.9869,0.8951],[0,1,0.9508],[0.1,0.9803,0.9016],[0.2,0.9311,0.8],[0.3,0.8721,0.6918],[0.4,0.7902,0.577],[0.5,0.6984,0.4557],[0.6,0.6,0.3344],[0.7,0.4885,0.2164]]},
  },
  poly_v: {
    width: 38, drop: 101, gap: 135,
    handleDrape: {"leftRollDeg":45.5,"rightRollDeg":56.6,"crownRollDeg":58.5,"leftRollKnots":[[0,0],[0.05,0],[0.1,5.5],[0.2,14.8],[0.3,23.4],[0.4,34.4],[0.5,45.5],[0.6,58.3],[0.7,76.2],[0.8,53.1],[0.9,35],[1,58.5]],"rightRollKnots":[[0,0],[0.05,19.9],[0.1,24.1],[0.2,29.9],[0.3,36.5],[0.4,45.6],[0.5,56.6],[0.6,67.3],[0.7,73.6],[0.8,51.8],[0.9,35],[1,58.5]],"centerlineKnots":[[-1,0],[-0.9941,0.0668],[-0.99,0.1336],[-0.9847,0.2004],[-0.973,0.2668],[-0.9589,0.333],[-0.9422,0.3989],[-0.9173,0.4636],[-0.8902,0.5279],[-0.8609,0.5918],[-0.8073,0.6387],[-0.7786,0.7027],[-0.7107,0.7487],[-0.628,0.7853],[-0.5404,0.8162],[-0.4489,0.8413],[-0.353,0.8572],[-0.2564,0.8713],[-0.1593,0.883],[-0.0609,0.8892],[0.0375,0.894],[0.136,0.8915],[0.2344,0.8855],[0.3318,0.8744],[0.4282,0.8599],[0.5234,0.8421],[0.6149,0.8169],[0.7051,0.7896],[0.7896,0.7552],[0.8622,0.71],[0.91,0.6531],[0.9504,0.598],[0.9751,0.5332],[0.9934,0.4676],[1.0052,0.4012],[1.0069,0.3344],[1.0068,0.2675],[1.0051,0.2006],[1.0033,0.1337],[1.0007,0.0669],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":101.39,"anchorGapMm":134.64,"anchorCenterOffsetMm":-1.91,"bodySizeMm":[330,360],"bodyBoundsPx":{"x":93,"y":316,"width":951,"height":1019},"handleBoundsPx":{"x":313,"y":29,"width":498,"height":288},"centerlineSamples":[[0.05,-0.9974,1],[0.1,-0.9948,1.0026],[0.2,-0.9871,1.0052],[0.3,-0.9691,1.0077],[0.4,-0.9433,1.0052],[0.5,-0.9046,0.9871],[0.6,-0.8582,0.9485],[0.7,-0.768,0.8247]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.894,"crownSilhouetteSamples":[[-0.7,0.8537,0.6899],[-0.6,0.9094,0.7143],[-0.5,0.9338,0.7352],[-0.4,0.9512,0.7526],[-0.3,0.9721,0.7666],[-0.2,0.9861,0.777],[-0.1,0.9965,0.7875],[0,1,0.7909],[0.1,1,0.7909],[0.2,0.9965,0.784],[0.3,0.9895,0.777],[0.4,0.9756,0.77],[0.5,0.9547,0.7491],[0.6,0.9268,0.7247],[0.7,0.892,0.6969]],"crownProjectedWidthMm":21.55,"crownWidthBasis":"apex-column-photo-scale","crownRollBasis":"width*cos(angle)+2mm*sin(angle)"},
  },
  poly_h: {
    width: 30, drop: 100, gap: 134,
    handleDrape: {"leftRollDeg":70.3,"rightRollDeg":59.8,"crownRollDeg":62.4,"leftRollKnots":[[0,0],[0.05,16.8],[0.1,22.9],[0.2,32.8],[0.3,41],[0.4,55.9],[0.5,70.3],[0.6,60],[0.7,59.9],[0.8,64],[0.9,37],[1,62.4]],"rightRollKnots":[[0,0],[0.05,24.6],[0.1,27.6],[0.2,34.1],[0.3,41.7],[0.4,49.2],[0.5,59.8],[0.6,70.7],[0.7,70.8],[0.8,49.4],[0.9,37],[1,62.4]],"centerlineKnots":[[-1,0],[-0.9993,0.0659],[-0.9967,0.1319],[-0.995,0.1978],[-0.9932,0.2638],[-0.9851,0.3293],[-0.9683,0.3943],[-0.9355,0.4564],[-0.8936,0.5155],[-0.8304,0.5663],[-0.7662,0.6166],[-0.6993,0.6653],[-0.6286,0.7104],[-0.5545,0.7542],[-0.4777,0.7959],[-0.3967,0.834],[-0.3104,0.8664],[-0.2206,0.8943],[-0.1258,0.9138],[-0.0277,0.9231],[0.071,0.9293],[0.1701,0.9314],[0.2681,0.9216],[0.3635,0.9039],[0.4559,0.8802],[0.542,0.8474],[0.6295,0.8165],[0.7136,0.7819],[0.7851,0.7362],[0.8143,0.698],[0.8725,0.6446],[0.9229,0.5887],[0.9493,0.5251],[0.9693,0.4606],[0.9851,0.3955],[0.9919,0.3297],[0.9958,0.2638],[0.9976,0.1979],[0.9993,0.1319],[1,0.066],[1,0]]},
    handleReference: {"source":"original-2d-handle-png","basis":"visible-body-opaque-bounds-mm","outerDropMm":100.31,"anchorGapMm":133.96,"anchorCenterOffsetMm":0.61,"bodySizeMm":[380,310],"bodyBoundsPx":{"x":57,"y":403,"width":1085,"height":890},"handleBoundsPx":{"x":369,"y":115,"width":464,"height":291},"centerlineSamples":[[0.05,-1.0026,1],[0.1,-1,1],[0.2,-0.9974,0.9974],[0.3,-0.9948,0.9948],[0.4,-0.9686,0.9843],[0.5,-0.9111,0.9582],[0.6,-0.7856,0.9163],[0.7,-0.6471,0.8065],[0.8,-0.4641,0.5712]],"visibleLoopCount":1,"physicalLoopCountVerified":false,"centerlineBasis":"x/half-anchor-gap,y/outer-photo-drop","centerlineMethod":"manual-checked-row-and-medial-cap-path","centerlinePeakRatio":0.9314,"crownSilhouetteSamples":[[-0.7,0.7674,0.5694],[-0.6,0.8194,0.6285],[-0.5,0.8646,0.691],[-0.4,0.9062,0.75],[-0.3,0.9375,0.7986],[-0.2,0.9653,0.8333],[-0.1,0.9826,0.8576],[0,0.9931,0.8646],[0.1,1,0.8611],[0.2,1,0.8403],[0.3,0.9965,0.8125],[0.4,0.9896,0.7778],[0.5,0.9757,0.7604],[0.6,0.9479,0.7465],[0.7,0.8924,0.7083]],"crownProjectedWidthMm":15.67,"crownWidthBasis":"apex-column-photo-scale","crownRollBasis":"width*cos(angle)+2mm*sin(angle)"},
  },
};
for (const photo of Object.values(HANDLES_FROM_PHOTOS)) {
  for (const key of ['leftRollKnots', 'rightRollKnots', 'centerlineKnots']) {
    photo.handleDrape[key].forEach(Object.freeze); Object.freeze(photo.handleDrape[key]);
  }
  photo.handleReference.centerlineSamples.forEach(Object.freeze);
  Object.freeze(photo.handleReference.centerlineSamples);
  photo.handleReference.crownSilhouetteSamples.forEach(Object.freeze);
  Object.freeze(photo.handleReference.crownSilhouetteSamples);
  Object.freeze(photo.handleReference.bodySizeMm); Object.freeze(photo.handleReference.bodyBoundsPx); Object.freeze(photo.handleReference.handleBoundsPx);
  Object.freeze(photo.handleDrape); Object.freeze(photo.handleReference); Object.freeze(photo);
}
const photoHandle = (id, color = '#ece6d9') => {
  const measured = HANDLES_FROM_PHOTOS[id]; return handle(measured.drop, measured.gap, measured.width, color);
};
// The 2D guide is positioned on the complete PNG, while artwork millimetres
// are measured on its visible body. Bounds use the 2D alpha>10/white<248 rule.
const reference = (iw, ih, x, y, w, h, cx, cy, pw, ph) => Object.freeze({
  image: Object.freeze({ width: iw, height: ih }), body: Object.freeze({ x, y, width: w, height: h }),
  print: Object.freeze({ cx, cy, width: pw, height: ph }),
});
const REFERENCE_LAYOUTS = {
  daily: reference(1276,1984,118,862,1034,1024,.5,.73,.56,.42),
  market: reference(1361,1928,64,895,1233,882,.5,.74,.68,.36),
  sgak_s: reference(1134,1701,145,711,830,947,.5,.72,.58,.44),
  sgak_m: reference(1134,1843,105,787,933,1027,.5,.72,.58,.44),
  sgak_l: reference(1276,2126,131,940,1014,1136,.5,.73,.58,.44),
  small: reference(850,1134,136,409,578,638,.5,.68,.56,.50),
  kids: reference(1191,1757,130,717,931,931,.5,.72,.60,.42),
  tumbler: reference(850,992,154,341,538,581,.5,.66,.54,.56),
  minja: reference(709,709,70,164,571,445,.5,.66,.70,.50),
  mitdan: reference(709,709,26,152,653,430,.5,.66,.70,.50),
  poly_v: reference(1134,1417,93,316,951,1019,.5,.72,.58,.42),
  poly_h: reference(1191,1361,57,403,1085,890,.5,.72,.58,.42),
};
function product(id, name, category, construction, dimensions, defaultHandle, extra = {}) {
  const flat = ['flat', 'pouch-flat', 'poly'].includes(construction);
  const supportsHandles = category !== 'pouch' || construction === 'tumbler';
  const profile = { id, name, category, construction,
    type: ({ sample: 'bottom-color-tote', flat: 'flat-tote', gusset: 'gusset-tote',
      'pouch-flat': 'flat-pouch', 'pouch-gusset': 'gusset-pouch', tumbler: 'tumbler-pouch', poly: 'poly-tote' })[construction],
    dimensions, defaultHandle, supportsHandles,
    handleFabric: category === 'poly' ? 'double-weave' : category === 'sample' ? 'webbing' : 'cotton-tape',
    handleFabricLabel: category === 'poly' ? '이중직 웨빙' : category === 'sample' ? '웨빙' : '면 테이프',
    handleDrape: HANDLES_FROM_PHOTOS[id]?.handleDrape || null,
    handleReference: HANDLES_FROM_PHOTOS[id]?.handleReference || null,
    handleAttachment: supportsHandles ? 'mouth' : 'none', handleAttachmentDepth: supportsHandles ? 25 : null, handleShape: 'tent',
    supportsBottomPanel: false, supportsPocket: false,
    allowedOptions: category === 'pouch' ? pouchOptions : category === 'poly' ? polyOptions : ecobagOptions,
    lockedOptions: category === 'pouch' ? ['zipper'] : category === 'poly' ? ['nameTag'] : [],
    defaultClosure: category === 'pouch' ? 'zipper' : null, clothKind: category === 'poly' ? 'poly' : 'canvas',
    nominalDepth: flat ? 0 : dimensions.depth, depthBasis: flat ? 'opening-estimate' : 'finished-bottom',
    visualDepthMm: dimensions.depth, referenceLayout: REFERENCE_LAYOUTS[id] || null,
    dimensionLimits: { 'dimensions.width': { min: 100, max: 600, step: 5 },
      'dimensions.height': { min: 100, max: 600, step: 5 },
      'dimensions.depth': { min: 30, max: flat ? 120 : 300, step: 5 } },
    assumptions: [
      `${name}의 기본 몸통 규격은 ${dimensions.width}×${dimensions.height}${flat ? '' : `×${dimensions.depth}`}mm${extra.dimensionsEstimated ? '로 사진 비율에서 추정했으며 실측은 확인되지 않았습니다' : '입니다'}. 높이에서 손잡이는 제외합니다.`,
      ...(flat ? [`봉제 바닥 깊이는 0mm인 평면형입니다. 3D 입구 벌림 ${dimensions.depth}mm는 형태 확인을 위한 추정값이며 제작 바닥 규격이 아닙니다.`] : []),
      ...(supportsHandles ? [`기본 손잡이 폭 ${defaultHandle.width}mm, 입구에서 위끝까지 ${defaultHandle.drop}mm, 중심 간격 ${defaultHandle.gap}mm는 기존 2D 사진을 몸통 규격에 맞춰 측정한 추정값입니다. 입구 부착 깊이와 3D 꼬임도 시각 추정값입니다.`] : []),
      '권장 인쇄 영역은 기존 2D 상품 이미지의 가이드와 같은 위치 및 비율을 사용합니다.',
    ], ...extra };
  return Object.freeze({ ...profile, dimensions: Object.freeze(profile.dimensions), defaultHandle: Object.freeze(profile.defaultHandle),
    allowedOptions: Object.freeze([...profile.allowedOptions]), lockedOptions: Object.freeze([...profile.lockedOptions]),
    dimensionLimits: Object.freeze(profile.dimensionLimits), assumptions: Object.freeze(profile.assumptions) });
}
const dims = (width, height, depth) => ({ width, height, depth });
export const PRODUCT3D_PROFILES = Object.freeze({
  [SAMPLE_PRODUCT_ID]: product(SAMPLE_PRODUCT_ID, '투라인 포켓 에코백 · 라지', 'sample', 'sample', dims(480, 340, 150), handle(290, 220, 38, '#171c28'),
    { handleAttachment: 'full-height', handleAttachmentDepth: null, supportsBottomPanel: true, supportsPocket: true, linkedHandleBottomColor: true,
      dimensionLimits: {}, assumptions: [
        '가로 480mm는 완성 몸통의 상단 좌우 폭, 깊이 150mm는 펼친 바닥 깊이로 가정했습니다.',
        '몸통 높이에는 하단 배색이 포함되고 손잡이는 제외됩니다.',
        '손잡이 폭 38mm, 중심 간격 220mm와 앞면 포켓 180×190mm는 사진 추정값입니다.',
        '17×17cm 표시는 권장 인쇄 영역으로 해석했습니다. 뒷면 포켓은 없는 것으로 가정했습니다.',
        '손잡이와 하단 배색은 하나의 공통 색상으로 제작합니다.',
      ] }),
  [DAILY_PRODUCT_ID]: product(DAILY_PRODUCT_ID, '데일리 에코백', 'ecobag', 'gusset', dims(360, 360, 100), photoHandle('daily'),
    { type: 'daily-tote', referenceHandleLength: 570, dimensionLimits: {}, assumptions: [
      '기존 데일리 에코백의 제품 규격 36×36×10cm를 몸통 360×360×100mm로 사용했습니다.',
      '몸통 높이는 손잡이를 제외하며, 하단 배색과 앞면 포켓이 없는 기본형입니다.',
      '기존 상품의 손잡이 두른길이는 570mm(시접 제외)이며 입구에서 손잡이 위끝까지의 길이와 다른 측정값입니다.',
      '기본 손잡이 길이 269mm(입구에서 위끝까지), 폭 34mm, 중심 간격 146mm는 기존 2D 사진을 몸통 규격에 맞춰 측정한 추정값입니다. 부착 깊이 25mm와 3D 꼬임은 시각 추정값입니다.',
      '권장 인쇄 영역은 기존 2D 상품 이미지의 가이드와 같은 위치 및 비율을 사용합니다.',
    ] }),
  [TWO_TONE_SMALL_PRODUCT_ID]: product(TWO_TONE_SMALL_PRODUCT_ID, '투라인 포켓 에코백 · 스몰', 'sample', 'sample', dims(340, 240, 100), handle(190, 160, 30, '#b52b43'),
    { handleAttachment: 'full-height', handleAttachmentDepth: null, supportsBottomPanel: true, supportsPocket: true, linkedHandleBottomColor: true,
      defaultBottomPanel: Object.freeze({ height: 60, color: '#b52b43' }),
      defaultPocket: Object.freeze({ width: 130, height: 135, bottom: 60, color: '#ece6d9' }),
      printGuideSize: 120, handleLoopStyle: 'folded-cloth', dimensionLimits: {}, dimensionsSource: 'user-measured', assumptions: [
        '사용자 제공 스몰 규격은 몸통 340×240×100mm, 손잡이 길이(입구에서 위끝까지) 190mm, 하단 배색 높이 60mm입니다.',
        '몸통 높이에는 하단 배색이 포함되고 손잡이는 제외됩니다.',
        '손잡이 폭 30mm, 중심 간격 160mm와 앞면 포켓 130×135mm는 사진 비율로 추정했습니다.',
        '12×12cm 표시는 권장 인쇄 영역으로 해석했습니다. 뒷면 포켓은 없는 것으로 가정했습니다.',
        '손잡이와 하단 배색은 하나의 공통 색상으로 제작합니다.',
      ] }),
  [TWO_TONE_KIDS_PRODUCT_ID]: product(TWO_TONE_KIDS_PRODUCT_ID, '투톤 에코백 · 키즈', 'sample', 'gusset', dims(330,330,80), photoHandle('kids'),
    { supportsBottomPanel:true, supportsPocket:false, handleShape:'rounded', fixedBodyColor:'#ece6d9',
      handleFabric:'cotton-tape', handleFabricLabel:'면 테이프',
      handleDrape:HANDLES_FROM_PHOTOS.kids.handleDrape, handleReference:HANDLES_FROM_PHOTOS.kids.handleReference,
      defaultBottomPanel:Object.freeze({height:60,color:'#171c28'}),
      referenceHandleLength:480, printGuideSize:240, dimensionsSource:'user-provided-photo',
      assumptions:[
        '사용자 제공 투톤 에코백 키즈 규격은 몸통 330×330×80mm입니다. 몸통 높이는 하단 배색을 포함하며 손잡이를 제외합니다.',
        '사진의 끈길이 480mm는 기존 키즈 상품과 같은 두른길이(시접 제외) 기준으로 해석했습니다. 입구에서 위끝까지의 길이와 다릅니다.',
        '손잡이는 입구 안쪽에 부착하는 면 테이프이며, 세로 웨빙과 앞면 외부 포켓은 없습니다.',
        '하단 배색 높이 60mm와 손잡이 폭 38mm, 입구에서 위끝까지 215mm, 중심 간격 146mm는 사진 비율에 따른 추정값입니다.',
        '몸통 색상은 아이보리로 고정합니다. 손잡이는 아이보리, 하단 배색은 블랙이 기본값이며 두 부위의 색상은 따로 변경할 수 있습니다.',
      ] }),
  small: product('small', '스몰 에코백', 'ecobag', 'flat', dims(200, 220, 30), photoHandle('small'), { referenceHandleLength: 570, handleShape: 'rounded' }),
  sgak_s: product('sgak_s', '사각 S', 'ecobag', 'flat', dims(290, 330, 30), photoHandle('sgak_s'), { referenceHandleLength: 560, handleShape: 'rounded' }),
  kids: product('kids', '키즈 에코백', 'ecobag', 'gusset', dims(330, 330, 80), photoHandle('kids'), { referenceHandleLength: 480, handleShape: 'rounded' }),
  sgak_m: product('sgak_m', '사각 M', 'ecobag', 'flat', dims(330, 360, 30), photoHandle('sgak_m'), { referenceHandleLength: 560 }),
  market: product('market', '마켓 에코백', 'ecobag', 'gusset', dims(430, 300, 100), photoHandle('market'), { referenceHandleLength: 570 }),
  sgak_l: product('sgak_l', '사각 L', 'ecobag', 'flat', dims(360, 400, 30), photoHandle('sgak_l'), { referenceHandleLength: 640 }),
  minja: product('minja', '민자 파우치', 'pouch', 'pouch-flat', dims(200, 150, 30), handle(80, 90)),
  mitdan: product('mitdan', '밑단 파우치', 'pouch', 'pouch-gusset', dims(230, 150, 60), handle(80, 90)),
  tumbler: product('tumbler', '텀블러 파우치', 'pouch', 'tumbler', dims(190, 200, 90), photoHandle('tumbler'), { handleEdgeMarginMm: 6 }),
  poly_v: product('poly_v', '폴리백 세로', 'poly', 'poly', dims(330, 360, 30), photoHandle('poly_v', '#040000'),
    { referenceHandleLength: 300, handleShape: 'rounded', dimensionsSource: 'user-measured' }),
  poly_h: product('poly_h', '폴리백 가로', 'poly', 'poly', dims(380, 310, 30), photoHandle('poly_h', '#040000'),
    { referenceHandleLength: 300, handleShape: 'rounded', dimensionsSource: 'user-measured' }),
});
export function isSupportedProduct(productId) { return typeof productId === 'string' && Object.hasOwn(PRODUCT3D_PROFILES, productId); }
export function getProductProfile(product = SAMPLE_PRODUCT_ID) {
  const id = typeof product === 'string' ? product : product && Object.hasOwn(product, 'productId') ? product.productId
    : (product?.productType === 'daily-tote' ? DAILY_PRODUCT_ID : !product?.productType || product.productType === 'bottom-color-tote' ? SAMPLE_PRODUCT_ID : null);
  if (!isSupportedProduct(id)) throw new Error('해당 상품의 3D 시안은 아직 준비되지 않았습니다.');
  return PRODUCT3D_PROFILES[id];
}
