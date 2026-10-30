from PIL import Image
A='/mnt/user-data/attachments/fa2c62ed-1efa-5131-af61-8d66bf6ef364/'
macro=Image.open(A+'11a22840-image.png').convert('RGB')
cols=[55,121,187,253,319]
def c(im,x,y,s=59): return im.crop((x,y,x+s,y+s))
act={ # (col,row y)
 'vicious_strike':(0,107),'pummel':(1,107),'poach':(2,107),'shield_smite':(3,107),'judgment':(4,107),
 'flash_rampage':(0,173),'debilitating_smash':(1,173),'warding_strike':(2,173),'shield_rush':(3,173),'annihilate':(4,173),
 'punishment':(0,239),'defiance':(1,239)}
pas={'enhance_health':(0,359),'warding_shield':(1,359),'punishing_benediction':(2,359),'ironclad_defense':(3,359),'guarding_seal':(4,359),
 'impact_hit':(0,425),'insulting_roar':(1,425),'fury':(2,425),'survival_willpower':(3,425),'block_pain':(4,425)}
out={}
for d in (act,pas):
  for k,(ci,y) in d.items(): out[k]=c(macro,cols[ci],y)
# stigmas
s1=Image.open(A+'74669496-image.png').convert('RGB')   # early: empyrean, doom shield bright
s2=Image.open(A+'3d38fdd7-image.png').convert('RGB')   # nezekan, sop, taunt bright
s3=Image.open(A+'03c36c1e-image.png').convert('RGB')   # second skin bright
gx=[1560,1626,1692,1758,1824]; gy=[139,205,271]
def g(r,cc): return c(s2,gx[cc],gy[r],60)
out['st_empyrean']=c(s1,1553,118,60); out['st_doom_shield']=c(s1,1619,184,60)
out['st_nezekan_shield']=g(0,1); out['st_shield_of_protection']=g(0,2); out['st_taunt']=g(0,3)
out['st_armor_of_balance']=g(0,4); out['st_second_skin']=c(s3,31,177,60)
out['st_noble_armor']=g(1,2); out['st_executing_blade']=g(1,3); out['st_comrade_in_arms']=g(1,4)
out['st_grapple']=g(2,0); out['st_assault_fury']=g(2,1); out['st_battlefield_banner']=g(2,2)
sheet=Image.new('RGB',(10*70,4*90),(20,20,20))
from PIL import ImageDraw
d=ImageDraw.Draw(sheet)
for i,(k,im) in enumerate(out.items()):
  w,h=im.size; im=im.crop((int(w*.17),int(h*.06),int(w*.84),int(h*.73))).resize((64,64)); im.save(f'icons/{k}.png')
  x,y=(i%10)*70,(i//10)*90; sheet.paste(im,(x+3,y)); d.text((x+2,y+66),k[:12],fill=(255,255,255))
sheet.save('sheet.png')
