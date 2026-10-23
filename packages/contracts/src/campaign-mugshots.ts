import {CAMPAIGN_TARGETS,getCampaignTarget} from './campaign';
interface Portrait{
 background:string;skin:string;coat:string;shirt:string;head:string;
 hairBack:string;hairFront:string;accessory:string;detail:string;mouth?:string;
}
// All paths, characters and palettes below are original project-authored vector art.
// Bold silhouettes/accessories are composed for a 96px UI, without fonts or fetched assets.
const portraits:Readonly<Record<string,Portrait>>={
 'nico-nickel':{
  background:'#477d82',skin:'#ce8c59',coat:'#275c68',shirt:'#e7c86d',head:'M52 53Q79 30 108 52L107 87Q102 110 80 115Q57 111 51 86Z',
  hairBack:'<path fill="#26343d" d="M45 73L43 45L57 40L57 28L72 35L85 20L91 33L111 30L107 45L118 52L111 77Z"/>',
  hairFront:'<path fill="#26343d" d="M51 57L59 42L69 51L82 40L88 51L107 46L111 62L99 55L82 59L69 51L57 63Z"/>',
  accessory:'coin-monocle',detail:'<circle cx="97" cy="77" r="13" fill="#e6b744" stroke="#27383d" stroke-width="3"/><circle cx="97" cy="77" r="8" fill="#fae9a2"/><path d="M94 73L100 81M100 73L94 81M109 83L117 111" fill="none" stroke="#92602e" stroke-width="2.5"/><path d="M67 124L80 135L93 124" fill="none" stroke="#e6b744" stroke-width="3"/><circle cx="80" cy="138" r="7" fill="#e6b744" stroke="#26383d" stroke-width="2"/>',
  mouth:'<path d="M65 98Q80 110 96 97" fill="#fff1cb" stroke="#26383d" stroke-width="2.5"/><path d="M81 101V106" stroke="#ad7b2a" stroke-width="5"/>',
 },
 'mabel-clench':{
  background:'#9f654e',skin:'#edbc8e',coat:'#d49a36',shirt:'#374f59',head:'M49 52Q79 35 111 53L112 91Q108 112 94 115H65Q47 108 47 88Z',
  hairBack:'<path d="M43 49Q42 29 78 28Q115 29 118 53L119 101L104 107L104 66H56L55 107L39 100Z" fill="#bfcac0"/>',
  hairFront:'<path d="M48 53Q80 35 112 54L109 65L96 57L81 64L67 57L50 65Z" fill="#e1e3d3"/>',
  accessory:'clamp-hardhat',detail:'<path d="M44 48Q46 16 80 16Q114 16 116 48Z" fill="#e8a43a" stroke="#26383d" stroke-width="3"/><path d="M74 17V42M85 17V42" stroke="#b97523" stroke-width="3"/><rect x="35" y="44" width="90" height="10" rx="5" fill="#ffd774" stroke="#26383d" stroke-width="3"/><path d="M32 122L45 130V151H31M128 122L115 130V151H129" fill="#f6df86"/><path d="M58 87L63 83M99 83L105 87" stroke="#be7b60" stroke-width="2"/>',
  mouth:'<path d="M66 102Q80 96 95 102Q82 112 66 102Z" fill="#a95248"/>',
 },
 'pip-quill':{
  background:'#71864e',skin:'#bc8056',coat:'#40675a',shirt:'#f2ddb6',head:'M53 51Q80 33 108 52L104 88L84 117L74 117L55 91Z',
  hairBack:'<path d="M48 70L45 49Q54 28 82 31Q113 28 115 60L109 80L101 51L58 49Z" fill="#473e35"/>',
  hairFront:'<path d="M52 58L61 45L78 50L90 42L109 51L107 62L90 55L77 61L61 54Z" fill="#473e35"/>',
  accessory:'paper-visor-glasses',detail:'<path d="M47 45L53 26L110 33L114 47Z" fill="#f4edcf" stroke="#26383d" stroke-width="2.5"/><path d="M52 46L99 48L119 60L75 55L45 55Z" fill="#d4a852" stroke="#26383d" stroke-width="2.5"/><path d="M61 31L91 35M59 37L102 42" stroke="#79918b" stroke-width="2"/><g fill="#e1e9d5" fill-opacity=".65" stroke="#26383d" stroke-width="4"><circle cx="64" cy="78" r="14"/><circle cx="96" cy="78" r="14"/><path d="M78 77H82"/></g><path d="M76 122L80 131L86 122L82 141Z" fill="#d1a143"/>',
  mouth:'<path d="M70 102Q80 99 91 102" fill="none" stroke="#26383d" stroke-width="2.5"/>',
 },
 'rosa-reel':{
  background:'#6d7191',skin:'#8c563e',coat:'#d1a342',shirt:'#eee2bb',head:'M51 53Q80 33 108 54L110 85Q101 110 79 117Q54 105 49 83Z',
  hairBack:'<g fill="#a95038"><circle cx="47" cy="55" r="21"/><circle cx="64" cy="39" r="23"/><circle cx="93" cy="38" r="23"/><circle cx="114" cy="55" r="22"/><circle cx="121" cy="82" r="19"/><circle cx="41" cy="83" r="21"/><circle cx="46" cy="104" r="17"/><circle cx="114" cy="105" r="17"/></g>',
  hairFront:'<path d="M48 63Q42 43 63 43Q70 48 80 44Q98 34 111 55L105 65L92 55L77 61L65 54L52 67Z" fill="#bd6244"/>',
  accessory:'red-tape-bow',detail:'<path d="M75 36L47 16L42 42L73 46M85 36L113 15L121 41L87 47" fill="#eab5a0" stroke="#26383d" stroke-width="3"/><rect x="73" y="33" width="14" height="16" rx="4" fill="#e57654" stroke="#26383d" stroke-width="2.5"/><path d="M49 72L76 74L71 85L57 85ZM84 74L111 71L104 85L89 85Z" fill="#d8e4d9" fill-opacity=".8" stroke="#26383d" stroke-width="3"/><path d="M76 77H84" stroke="#26383d" stroke-width="3"/><circle cx="48" cy="93" r="5" fill="#f1d17a"/><circle cx="112" cy="93" r="5" fill="#f1d17a"/>',
  mouth:'<path d="M68 101Q80 113 94 98Q80 105 68 101Z" fill="#e1b39a"/>',
 },
 'hector-hush':{
  background:'#8c5e7a',skin:'#e4ab79',coat:'#714458',shirt:'#f2e7c8',head:'M53 53Q79 38 106 52L107 86L98 110L80 120L61 110L52 86Z',
  hairBack:'<path d="M48 64Q36 44 53 36Q43 12 75 17Q95 9 109 31Q125 43 110 74L100 53L59 54Z" fill="#3e374f"/>',
  hairFront:'<path d="M52 58Q58 35 83 37Q93 21 106 39L109 59L93 52L76 57L61 52Z" fill="#51415e"/>',
  accessory:'giant-rubber-stamp',detail:'<path d="M80 98Q65 83 58 98Q66 108 80 102Q95 110 103 97Q94 84 80 98Z" fill="#51415e"/><path d="M66 123L80 132L94 123L88 146H72Z" fill="#d3a24e"/><path d="M120 115L132 108L140 126L127 131Z" fill="#906541" stroke="#26383d" stroke-width="2.5"/><path d="M118 130L142 120L150 140L125 151Z" fill="#e0b36b" stroke="#26383d" stroke-width="3"/><path d="M124 146L148 136" stroke="#a95a56" stroke-width="7"/>',
 },
 'otis-bell':{
  background:'#587c96',skin:'#b57549',coat:'#d67e3b',shirt:'#e7d1a3',head:'M50 51Q53 28 80 28Q109 30 111 54L108 91Q104 111 80 118Q55 113 50 92Z',
  hairBack:'<path d="M47 64Q37 64 38 82L47 93M113 64Q124 64 122 82L112 93" fill="#784b35"/>',
  hairFront:'<path d="M63 40Q80 33 96 42" fill="none" stroke="#e4ae75" stroke-width="4"/>',
  accessory:'siren-headphones',detail:'<path d="M39 78V59Q39 24 80 24Q121 24 121 59V78" fill="none" stroke="#26383d" stroke-width="10"/><path d="M39 73V55Q39 25 80 25Q121 25 121 55V73" fill="none" stroke="#e8bf56" stroke-width="4"/><rect x="30" y="65" width="19" height="31" rx="7" fill="#3d5965" stroke="#26383d" stroke-width="3"/><rect x="111" y="65" width="19" height="31" rx="7" fill="#3d5965" stroke="#26383d" stroke-width="3"/><path d="M66 24V17Q80 0 94 17V24Z" fill="#ea7858" stroke="#26383d" stroke-width="3"/><path d="M76 11V21" stroke="#ffd19a" stroke-width="4"/><path d="M41 123L53 153M119 123L107 153" stroke="#8d4d2c" stroke-width="5"/>',
  mouth:'<path d="M65 101Q80 112 95 101" fill="#f3e1bf" stroke="#26383d" stroke-width="2.5"/>',
 },
 'tess-cone':{
  background:'#507d70',skin:'#d8a57b',coat:'#3f6781',shirt:'#d5b36d',head:'M49 56Q79 40 109 56L111 87Q106 115 80 119Q53 115 48 87Z',
  hairBack:'<path d="M41 62Q38 39 57 36L105 37Q124 41 119 72L117 104L106 109L106 64H54V108L40 100Z" fill="#61463b"/>',
  hairFront:'<path d="M48 62L55 47L70 58L82 48L95 57L110 48L112 66L97 61L81 66L66 60L52 69Z" fill="#735242"/>',
  accessory:'traffic-cone-helmet',detail:'<path d="M53 46L72 8H88L108 46Z" fill="#ea8d42" stroke="#26383d" stroke-width="3"/><path d="M64 24H96L102 35H58Z" fill="#fff0c9"/><rect x="43" y="44" width="75" height="11" rx="4" fill="#efaa54" stroke="#26383d" stroke-width="3"/><g fill="#a66c53"><circle cx="57" cy="88" r="2"/><circle cx="64" cy="91" r="2"/><circle cx="103" cy="88" r="2"/><circle cx="96" cy="91" r="2"/></g><path d="M51 120L57 152H104L110 120" fill="none" stroke="#bdcfbf" stroke-width="7"/><circle cx="59" cy="137" r="3" fill="#e8c669"/><circle cx="102" cy="137" r="3" fill="#e8c669"/>',
 },
 'iris-vale':{
  background:'#507c87',skin:'#945c45',coat:'#e8e3cb',shirt:'#335b68',head:'M51 53Q79 35 108 52L107 86Q101 107 80 117Q55 108 50 84Z',
  hairBack:'<path d="M42 64Q35 34 60 31Q73 20 95 29Q121 27 123 60L119 108L108 115L104 61L54 59L53 114L38 101Z" fill="#365764"/>',
  hairFront:'<path d="M48 59Q56 39 75 47Q93 31 113 49L109 65L95 56L80 63L67 55L53 67Z" fill="#416b77"/>',
  accessory:'star-cap-stethoscope',detail:'<path d="M48 47L53 27Q80 16 108 27L113 47Z" fill="#e9e8d2" stroke="#26383d" stroke-width="3"/><path d="M80 25L84 33L94 34L87 41L88 49L80 45L72 49L73 40L66 34L76 33Z" fill="#558c8d"/><path d="M57 118V130Q57 147 73 147H86Q102 147 102 130V118" fill="none" stroke="#477d7b" stroke-width="5"/><circle cx="88" cy="146" r="7" fill="#cad8c7" stroke="#26383d" stroke-width="3"/><path d="M50 120L68 133L64 153M110 120L93 132L97 153" fill="none" stroke="#c1c9b7" stroke-width="3"/>',
  mouth:'<path d="M68 101Q81 107 94 99" fill="none" stroke="#ead0ac" stroke-width="3"/>',
 },
 'juno-slip':{
  background:'#937653',skin:'#dfae85',coat:'#394a58',shirt:'#db8b49',head:'M52 53Q80 36 108 52L106 88L91 115H72L53 93Z',
  hairBack:'<path d="M46 70Q37 39 62 26Q82 15 106 28L119 48L110 81L101 54L54 64Z" fill="#293b43"/>',
  hairFront:'<path d="M48 64Q45 35 74 31Q92 21 110 38L112 54L92 49L79 59L60 64L50 79Z" fill="#293b43"/><path d="M102 57L111 55L111 72L103 77" fill="#92785f"/>',
  accessory:'receipt-scarf',detail:'<path d="M60 116Q79 131 99 115L108 123Q83 142 55 125Z" fill="#f1e6bf" stroke="#26383d" stroke-width="2.5"/><path d="M99 122Q131 117 128 137Q122 149 145 143L143 157Q109 163 111 141Q116 131 94 135Z" fill="#f1e6bf" stroke="#26383d" stroke-width="2.5"/><path d="M67 122L72 127M79 124L84 130M91 121L95 126M119 135L124 140M124 149L136 152" stroke="#8c9080" stroke-width="2"/>',
  mouth:'<path d="M68 103L84 103L94 98" fill="none" stroke="#26383d" stroke-width="2.5"/>',
 },
 'aldo-ledger':{
  background:'#665c77',skin:'#e3bc91',coat:'#3c4a60',shirt:'#f2e5bd',head:'M50 53Q80 37 110 53L111 86Q108 111 81 119Q53 113 49 86Z',
  hairBack:'<path d="M43 59L49 41L111 42L117 60L111 91L104 72L55 70L49 92Z" fill="#d7d6bf"/>',
  hairFront:'<path d="M49 59L59 51L68 60L80 53L95 60L108 52L111 67L99 61L81 67L65 61L51 68Z" fill="#e8e4cc"/>',
  accessory:'chairman-cap-key',detail:'<path d="M40 39Q80 12 120 39L114 50H46Z" fill="#384960" stroke="#26383d" stroke-width="3"/><path d="M45 45H115L108 58H52Z" fill="#d9b45d" stroke="#26383d" stroke-width="2.5"/><path d="M50 57Q80 69 112 56L103 69H59Z" fill="#293b4e"/><path d="M80 26L85 34L80 42L75 34Z" fill="#e8ca72"/><path d="M55 75H74V85H55ZM86 75H105V85H86Z" fill="#d2dfcb" fill-opacity=".8" stroke="#26383d" stroke-width="3"/><path d="M74 78H86" stroke="#26383d" stroke-width="3"/><path d="M80 99Q66 86 57 98Q52 98 52 93Q46 111 66 110L80 104L94 110Q113 113 109 94Q104 103 101 96Q92 88 80 99Z" fill="#eee5c9" stroke="#a49678" stroke-width="1.5"/><path d="M65 121L80 131L95 121L90 151H71Z" fill="#d0a14e"/><circle cx="113" cy="127" r="6" fill="none" stroke="#e9c969" stroke-width="4"/><path d="M109 132L97 146M103 139L107 143M99 143L103 147" stroke="#e9c969" stroke-width="4"/>',
 },
};
const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function draw(id:string):string{
 const target=getCampaignTarget(id),p=portraits[target.id]!,label=escape(`${target.name} — ${target.alias}`);
 const mouth=p.mouth??'<path d="M67 102Q80 109 94 101" fill="none" stroke="#26383d" stroke-width="2.5"/>';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${label}" data-accessory="${p.accessory}"><title>${label}</title><rect width="160" height="160" rx="12" fill="${p.background}"/><path d="M8 32H152M8 64H152M8 96H152M8 128H152" stroke="#e8e0bd" stroke-opacity=".2" stroke-width="2"/><path d="M12 12H26M12 12V26M134 12H148V26" fill="none" stroke="#f0e3b5" stroke-width="3"/><path d="M23 160V140Q26 118 59 114H102Q135 118 139 141V160Z" fill="${p.coat}" stroke="#26383d" stroke-width="3"/><path d="M65 113L80 134L98 114L103 160H61Z" fill="${p.shirt}"/><path d="M67 100V118Q79 130 94 118V100Z" fill="${p.skin}" stroke="#26383d" stroke-width="2.5"/>${p.hairBack}<ellipse cx="49" cy="79" rx="8" ry="12" fill="${p.skin}" stroke="#26383d" stroke-width="2.5"/><ellipse cx="111" cy="79" rx="8" ry="12" fill="${p.skin}" stroke="#26383d" stroke-width="2.5"/><path d="${p.head}" fill="${p.skin}" stroke="#26383d" stroke-width="2.5"/><path d="M58 68L71 67M90 66L103 69" fill="none" stroke="#26383d" stroke-width="3" stroke-linecap="round"/><ellipse cx="65" cy="78" rx="3" ry="4" fill="#26383d"/><ellipse cx="96" cy="78" rx="3" ry="4" fill="#26383d"/><path d="M80 79L76 92H84" fill="none" stroke="#865b43" stroke-width="2.5" stroke-linecap="round"/>${mouth}${p.hairFront}${p.detail}${target.isBoss?'<path d="M22 133L28 141L22 149L16 141Z" fill="#f0cc73" stroke="#26383d" stroke-width="2"/>':''}<path d="M5 151V144M155 151V144" stroke="#f1e2b8" stroke-width="2"/></svg>`;
}
const byId=new Map(CAMPAIGN_TARGETS.map(target=>[target.id,draw(target.id)]));
/** Returns cached trusted SVG only. Caller input is never interpolated into markup. */
export function getCampaignMugshot(id:string):string{return byId.get(id)??byId.get(CAMPAIGN_TARGETS[0]!.id)!;}
