import cairosvg, os, sys
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W, H = 1600, 1080
INK="#1d1d1f"; MUTED="#636366"; BLUE="#0066cc"; GUARD="#5e5ce6"; ELDER="#b84f00"; CARE="#127a8c"; GREEN="#1e7f36"
FONT="Inter, Helvetica, Arial, sans-serif"
TINT={"great":"#ffd36b","good":"#ffe08a","calm":"#cfe8ff","okay":"#e9e9ef","uneasy":"#e4dcff","low":"#d6e4f5"}
MOUTH={"great":"M14 25 Q24 36 34 25","good":"M15 27 Q24 33 33 27","calm":"M16 28 Q24 31 32 28","okay":"M16 29 L32 29","uneasy":"M16 31 Q24 27 32 31","low":"M15 33 Q24 25 33 33"}

def t(x,y,s,size=15,w=400,fill=INK,anchor="start",ls=0):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}" letter-spacing="{ls}">{s}</text>'
def rect(x,y,w,h,r=12,fill="#fff",stroke="none",sw=1,op=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" opacity="{op}"/>'
def glass(x,y,w,h,r=24):
    return (rect(x+1,y+6,w,h,r,"#2a2a6a",op=0.05)+rect(x,y,w,h,r,"url(#glassfill)")
            +rect(x+0.5,y+0.5,w-1,h-1,r,"none","#ffffff",1.5,0.95))
def face(x,y,k,size=44,sel=False):
    s=size/48
    eyes = ('<g stroke="#3a3a3c" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M14 19 Q17 22 20 19"/><path d="M28 19 Q31 22 34 19"/></g>' if k=="calm"
            else '<g fill="#3a3a3c"><circle cx="17" cy="19" r="2.6"/><circle cx="31" cy="19" r="2.6"/></g>')
    brow = '<g stroke="#3a3a3c" stroke-width="2" stroke-linecap="round"><path d="M13 14 L19 12.5"/><path d="M35 14 L29 12.5"/></g>' if k=="low" else ""
    ring = f'<circle cx="24" cy="24" r="23.5" fill="none" stroke="{ELDER}" stroke-width="2.4"/>' if sel else ""
    return (f'<g transform="translate({x},{y}) scale({s})"><circle cx="24" cy="24" r="22" fill="{TINT[k]}"/>'
            f'<circle cx="24" cy="24" r="21.25" fill="none" stroke="rgba(29,29,31,0.08)" stroke-width="1.5"/>{eyes}{brow}'
            f'<path d="{MOUTH[k]}" stroke="#3a3a3c" stroke-width="2.6" stroke-linecap="round" fill="none"/>{ring}</g>')
def btn(x,y,w,label,primary=True,color=BLUE,h=40,size=14):
    if primary: b=rect(x,y,w,h,h/2,color)+t(x+w/2,y+h/2+5,label,size,600,"#fff","middle")
    else: b=rect(x,y,w,h,h/2,"#ffffff",op=0.9)+rect(x,y,w,h,h/2,"none","rgba(0,0,0,0.10)")+t(x+w/2,y+h/2+5,label,size,600,color,"middle")
    return b
def pill(x,y,w,label,fill,color,h=24,size=12):
    return rect(x,y,w,h,h/2,fill)+t(x+w/2,y+h/2+4,label,size,600,color,"middle")

PW,PH=360,760
def phone(x,y,inner,label,bg="url(#screen)"):
    return (f'<g transform="translate({x},{y})">'
        +rect(-10,-10,PW+20,PH+20,58,"#1d1d1f")+rect(-8,-8,PW+16,PH+16,56,"#3a3a3c")
        +f'<clipPath id="c{x}{y}"><rect x="0" y="0" width="{PW}" height="{PH}" rx="48"/></clipPath>'
        +f'<g clip-path="url(#c{x}{y})">'+rect(0,0,PW,PH,48,bg)
        +'<circle cx="300" cy="120" r="140" fill="url(#blobA)"/><circle cx="40" cy="520" r="170" fill="url(#blobB)"/><circle cx="330" cy="700" r="150" fill="url(#blobC)"/>'
        +t(32,30,"9:41",15,600)+rect(130,12,100,30,15,"#000")
        +rect(298,20,24,12,3,"none",INK,1.4)+rect(301,23,16,6,1.5,INK)
        +inner+'</g>'+rect(130,PH-14,100,5,2.5,INK,op=0.85)+'</g>'
        +t(x+PW/2,y+PH+44,label,15,600,MUTED,"middle"))

def tabbar(items, active, color):
    s=glass(16,684,328,60,30)
    n=len(items); step=328/n
    for i,it in enumerate(items):
        cx=16+step*i+step/2
        c=color if i==active else MUTED
        s+=f'<circle cx="{cx}" cy="704" r="7" fill="none" stroke="{c}" stroke-width="2"/>'+t(cx,730,it,11,600 if i==active else 500,c,"middle")
    return s

DEFS='''<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f7fb"/><stop offset="1" stop-color="#eef1f8"/></linearGradient>
<linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfd"/><stop offset="1" stop-color="#f3f4f9"/></linearGradient>
<linearGradient id="lock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9d7f2"/><stop offset="0.5" stop-color="#e6dcf5"/><stop offset="1" stop-color="#f7e3d6"/></linearGradient>
<linearGradient id="glassfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.86"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.62"/></linearGradient>
<radialGradient id="blobA"><stop offset="0" stop-color="#bcd4ff" stop-opacity="0.75"/><stop offset="1" stop-color="#bcd4ff" stop-opacity="0"/></radialGradient>
<radialGradient id="blobB"><stop offset="0" stop-color="#e2d6ff" stop-opacity="0.8"/><stop offset="1" stop-color="#e2d6ff" stop-opacity="0"/></radialGradient>
<radialGradient id="blobC"><stop offset="0" stop-color="#ffe0c7" stop-opacity="0.8"/><stop offset="1" stop-color="#ffe0c7" stop-opacity="0"/></radialGradient>
<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9f43"/><stop offset="1" stop-color="#ffc56b"/></linearGradient>
<linearGradient id="water" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5ac8fa"/><stop offset="1" stop-color="#9edcff"/></linearGradient>
</defs>'''

def board(fname, kicker, title, sub, phones, notes, refs):
    s=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{DEFS}'
    s+=rect(0,0,W,H,0,"url(#bg)")
    s+=t(80,78,kicker.upper(),13,700,GUARD,ls=1.6)+t(80,122,title,38,700)+t(80,156,sub,17,400,MUTED)
    s+="".join(phones)
    # notes column
    nx=1250; s+=glass(nx,200,290,560,24)+t(nx+24,236,"What changes",13,700,GUARD,ls=1.2)
    y=270
    for n in notes:
        s+=f'<circle cx="{nx+30}" cy="{y-5}" r="4" fill="{GUARD}"/>'
        for i,line in enumerate(n): s+=t(nx+44,y+i*20,line,14,500 if i==0 else 400,INK if i==0 else MUTED)
        y+=20*len(n)+16
    s+=glass(nx,780,290,190,24)+t(nx+24,816,"References",13,700,GUARD,ls=1.2)
    y=846
    for r in refs:
        for i,line in enumerate(r): s+=t(nx+24,y+i*18,line,13,500 if i==0 else 400,INK if i==0 else MUTED)
        y+=18*len(r)+10
    s+=t(80,1056,"Circle Care · Sprint 12 Everyday Care · Design mockup · Fictional demo data, no real PHI",12,500,MUTED)
    s+='</svg>'
    open(f"{OUT}/{fname}.svg","w").write(s)
    cairosvg.svg2png(bytestring=s.encode(), write_to=f"{OUT}/{fname}.png", output_width=W*2, output_height=H*2)

# ---------- Board 1: refill tracker ----------
p1 = t(24,92,"Medicines",30,700)+t(24,118,"Maggie · 4 active",14,400,MUTED)
p1 += glass(16,138,328,250)
p1 += rect(32,156,40,40,12,"#fff4e5")+'<rect x="44" y="166" width="16" height="20" rx="6" fill="none" stroke="#b84f00" stroke-width="2"/>'
p1 += t(84,172,"Atorvastatin",17,600)+t(84,192,"20 mg tablet · 8:00 PM",13,400,MUTED)
p1 += pill(262,160,66,"Low",'#fff1df',"#9a4f00")
p1 += t(32,230,"6 days left",22,700)+t(32,252,"6 tablets on hand · runs out Nov 20",13,400,MUTED)
p1 += rect(32,266,296,8,4,"#efeff4")+rect(32,266,60,8,4,"url(#bar)")
p1 += t(32,298,"Refill added to the Calendar on Nov 17.",13,500,"#9a4f00")
p1 += btn(32,316,140,"Request refill")+btn(182,316,130,"New bottle",False)
p1 += glass(16,402,328,150)
p1 += rect(32,420,40,40,12,"#e8f1fd")+'<rect x="44" y="430" width="16" height="20" rx="6" fill="none" stroke="#0066cc" stroke-width="2"/>'
p1 += t(84,436,"Metformin",17,600)+t(84,456,"500 mg · 8:00 AM, 6:00 PM",13,400,MUTED)
p1 += t(32,494,"24 days left",18,700)+t(150,494,"48 on hand · runs out Dec 8",13,400,MUTED)
p1 += rect(32,508,296,8,4,"#efeff4")+rect(32,508,236,8,4,"#7fbf8f")
p1 += t(32,538,"Refill alert at",13,400,MUTED)+pill(122,522,80,"7 days",'#efeffd',GUARD)
p1 += tabbar(["Home","Health","Meds","Chat","Circle"],2,GUARD)

p2 = t(24,92,"Medicines",30,700,op:=INK)
p2 += rect(0,0,PW,PH,0,"#000",op=0.18)
p2 += glass(0,300,PW,460,34)+rect(150,312,60,5,2.5,"#c7c7cc")
p2 += t(24,358,"New bottle of Atorvastatin",21,700)
p2 += t(24,396,"How many are in the bottle?",14,600,MUTED)
p2 += rect(24,408,312,58,16,"#ffffff")+rect(24,408,312,58,16,"none","#0066cc",2)+t(44,446,"90",26,600)
for i,n in enumerate(["30","60","90"]):
    sel = n=="90"
    p2 += (rect(24+i*106,484,98,40,20,"#e8f1fd" if sel else "#ffffff")+rect(24+i*106,484,98,40,20,"none","#0066cc" if sel else "rgba(0,0,0,0.1)",1.5)
           +t(73+i*106,509,n,15,600,BLUE,"middle"))
p2 += btn(24,546,312,"Save count",h=54,size=17)
p2 += t(180,628,"The count goes down by one each time a dose",12,400,MUTED,"middle")+t(180,646,"is marked taken. Skipped doses don't count.",12,400,MUTED,"middle")

p3 = t(180,150,"Saturday, November 14",17,500,"#3a3a3c","middle")+t(180,236,"10:00",86,300,"#1d1d1f","middle")
p3 += glass(14,290,332,96,26)+rect(30,308,38,38,10,"#5e5ce6")+'<circle cx="49" cy="327" r="8" fill="none" stroke="#fff" stroke-width="2.4"/>'
p3 += t(80,318,"CIRCLE CARE",11,700,MUTED,ls=1)+t(316,318,"now",11,500,MUTED,"end")
p3 += t(80,340,"You have a reminder from Circle Care",14,600)+t(80,360,"Open the app to see it.",13,400,MUTED)
p3 += glass(14,404,332,250,26)+t(32,438,"Ana's Today · Pills on hand",14,700,CARE)
rows=[("Atorvastatin","6 days","#9a4f00","#fff1df"),("Lisinopril","12 days",GREEN,"#e9f8ed"),("Metformin","24 days",GREEN,"#e9f8ed"),("Vitamin D","57 days",GREEN,"#e9f8ed")]
for i,(n,d,c,f) in enumerate(rows):
    yy=470+i*44
    p3 += t(32,yy,n,15,600)+pill(250,yy-16,78,d,f,c)
    if i<3: p3 += rect(32,yy+14,296,1,0,"#e8e8ed")
p3 += t(32,640,"Low medicines show first.",12,400,MUTED)

board("01-refill-tracker","Medication Safety · CC-120, CC-121","Refill tracker and low-supply alerts",
  "Pills count down as doses are marked taken. Families hear about a refill a week before it runs out.",
  [phone(80,200,p1,"Sarah · Medicines"),phone(470,200,p2,"New bottle sheet"),phone(860,200,p3,"Lock screen and Ana's Today",bg="url(#lock)")],
  [["Days left on every card","Count, bar and run-out date"],["One alert at 7 days","Sarah picks 3 to 14 days"],["Refill lands on the Calendar","3 days before it runs out"],["Lock screen stays generic","No medicine name shown"],["New bottle in two taps","30, 60 and 90 presets"]],
  [["Medisafe","Refill reminders from pills left"],["CareZone","Bottle counts and refills"],["Apple Health Medications","Calm list, clear status"]])

# ---------- Board 2: daily check-ins ----------
e = t(24,92,"Good morning, Maggie",26,700)+t(24,118,"Saturday, November 14",15,400,MUTED)
e += glass(16,140,328,520,28)
e += t(36,178,"My day",22,700)+t(324,178,"Optional · saves as you tap",12,400,MUTED,"end")
e += t(36,214,"How do you feel?",16,600)
labels=[("great","Great"),("good","Good"),("calm","Calm"),("okay","Okay"),("uneasy","Not great"),("low","Low")]
for i,(k,l) in enumerate(labels):
    col=i%3; row=i//3
    fx=44+col*100; fy=228+row*96
    sel = k=="calm"
    if sel: e += rect(fx-14,fy-8,80,88,20,"#fff4e5")
    e += face(fx,fy,k,52,sel)+t(fx+26,fy+72,l,13,600 if sel else 500,ELDER if sel else MUTED,"middle")
e += rect(36,428,288,1,0,"#e8e8ed")
e += t(36,462,"Water",16,600)+t(324,462,"4 of 6 glasses",13,500,MUTED,"end")
e += f'<circle cx="62" cy="504" r="22" fill="#ffffff" stroke="rgba(0,0,0,0.1)"/>'+t(62,511,"–",22,500,INK,"middle")
for i in range(6):
    gx=104+i*28; full=i<4
    e += f'<path d="M{gx} 488 L{gx+18} 488 L{gx+15} 520 L{gx+3} 520 Z" fill="{"#9edcff" if full else "#ffffff"}" stroke="#5ac8fa" stroke-width="1.6"/>'
e += f'<circle cx="298" cy="504" r="22" fill="#0066cc"/>'+t(298,512,"+",24,500,"#fff","middle")
e += rect(36,540,288,1,0,"#e8e8ed")
e += t(36,574,"Meals",16,600)
for i,(m,on) in enumerate([("Breakfast",True),("Lunch",True),("Dinner",False)]):
    mx=36+i*98
    e += rect(mx,590,90,48,16,"#e9f8ed" if on else "#ffffff")+rect(mx,590,90,48,16,"none",GREEN if on else "rgba(0,0,0,0.1)",1.5)
    e += t(mx+45,620,m,14,600,GREEN if on else MUTED,"middle")
e += glass(60,676,240,40,20)+t(180,701,"Saved: Calm",14,600,INK,"middle")

g = t(24,92,"Health",30,700)+t(24,118,"Maggie · last 7 days",14,400,MUTED)
g += glass(16,140,328,380,24)
g += t(32,174,"Daily check-ins",17,700)+t(32,196,"4.7 glasses a day · meals logged 6 of 7 days",12,400,MUTED)
days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; feel=["good","calm","okay",None,"good","great","calm"]; water=[5,4,6,3,5,6,4]; meals=[3,3,2,2,3,3,2]
for i,d in enumerate(days):
    cx=90+i*36
    g += t(cx,228,d,11,600,MUTED,"middle")
    if feel[i]: g += face(cx-14,240,feel[i],28)
    else: g += f'<circle cx="{cx}" cy="254" r="5" fill="#d1d1d6"/>'
    g += rect(cx-7,300,14,90,7,"#eef6fb")+rect(cx-7,300+90-90*water[i]/6,14,90*water[i]/6,7,"url(#water)")
    g += t(cx,408,str(water[i]),11,600,MUTED,"middle")
    for j in range(3):
        g += f'<circle cx="{cx-9+j*9}" cy="434" r="3.4" fill="{GREEN if j<meals[i] else "#d1d1d6"}"/>'
g += t(32,258,"Feeling",11,600,MUTED)+t(32,350,"Water",11,600,MUTED)+t(32,438,"Meals",11,600,MUTED)
g += t(32,470,"Maggie adds these when she wants to, so a",12,400,MUTED)+t(32,488,"blank day isn't a problem on its own.",12,400,MUTED)
g += glass(16,536,328,118,24)+rect(32,556,36,36,10,"#efeffd")+t(50,580,"i",18,700,GUARD,"middle")
g += t(80,570,"No meals logged for 2 days",15,600)+t(80,590,"Maggie hasn't logged meals for",13,400,MUTED)+t(80,608,"2 days. A quick call might help.",13,400,MUTED)
g += btn(80,618,110,"Call Maggie",h=30,size=12,color=GUARD)
g += tabbar(["Home","Health","Meds","Chat","Circle"],1,GUARD)

pc = t(24,92,"Privacy Center",28,700)+t(24,118,"You decide who sees what",15,400,MUTED)
pc += glass(16,140,328,250,24)
pc += t(32,178,"Share check-ins with Sarah",16,600)
pc += t(32,202,"Your feeling, water and meals.",13,400,MUTED)+t(32,220,"Your I'm OK check-in always reaches her.",13,400,MUTED)
pc += rect(268,164,60,34,17,"#34c759")+'<circle cx="311" cy="181" r="14" fill="#fff"/>'
pc += rect(32,244,296,1,0,"#e8e8ed")
pc += t(32,278,"Who can see them",14,600)
for i,(n,ok) in enumerate([("Sarah (guardian)","Can see"),("James (family)","Can't see"),("Ana (caregiver)","Can't see")]):
    yy=308+i*26
    pc += t(32,yy,n,13,500)+t(328,yy,ok,13,600,GREEN if ok=="Can see" else MUTED,"end")
pc += glass(16,406,328,120,24)+t(32,440,"Chat tile on my home",16,600)+t(32,464,"A large tile with the newest message.",13,400,MUTED)
pc += rect(268,424,60,34,17,"#34c759")+'<circle cx="311" cy="441" r="14" fill="#fff"/>'
pc += t(32,500,"Changes are saved and logged.",12,400,MUTED)

board("02-daily-checkins","Elder Independence · CC-142, CC-143","Daily check-ins: feeling, water and meals",
  "Maggie logs her day in a few taps. Sarah sees a gentle 7-day picture only while Maggie shares it.",
  [phone(80,200,e,"Maggie · My day"),phone(470,200,g,"Sarah · Health, Well-being"),phone(860,200,pc,"Maggie · Privacy Center")],
  [["Six drawn faces, no emoji","One tap saves, tap again clears"],["Water and meals in one panel","Large 44 to 56 point targets"],["7-day grid for Sarah","Faces, water bars, meal dots"],["A soft note, not an alarm","Only after 2 days with no meals"],["Maggie owns the switch","Caregivers never see it"]],
  [["Apple Health, State of Mind","One-tap mood with simple faces"],["Daylio","Quick daily logging"],["CaringBridge","Gentle family updates"]])

# ---------- Board 3: family chat ----------
def bubble(x,y,w,lines,mine,name=None,voice=False,large=False):
    fs=17 if large else 14; lh=24 if large else 19
    h=len(lines)*lh+20
    s=""
    if name: s+=t(x+4,y-6,name,11,600,MUTED)
    fill = "#0066cc" if mine else "url(#glassfill)"
    s+=rect(x,y,w,h,18,fill)
    if not mine: s+=rect(x+0.5,y+0.5,w-1,h-1,18,"none","#ffffff",1.2)
    for i,l in enumerate(lines): s+=t(x+14,y+22+i*lh,l,fs,400,"#fff" if mine else INK)
    if voice: s+=t(x+w-12,y+h+14,"By voice",10,600,MUTED,"end")
    return s
c = t(24,92,"Family",30,700)+t(24,118,"Maggie, Sarah, James · end-to-end encrypted",12,400,MUTED)
c += bubble(16,150,250,["Walked Ocean Beach this","morning, photos tonight!"],False,"James")
c += bubble(16,230,230,["Lovely. The fog lifted","by 10 here."],False,"Maggie",voice=True)
c += bubble(110,318,234,["Bringing noodle soup from","Clement Street on Sunday."],True)
c += bubble(16,404,200,["Yes please, thank you."],False,"Maggie",voice=True)
c += bubble(16,476,262,["Giants day game at Oracle","Park next week, who's in?"],False,"James")
c += glass(16,612,328,56,28)+t(36,646,"Message",15,400,MUTED)+'<circle cx="318" cy="640" r="18" fill="#0066cc"/>'+'<path d="M318 648 L318 632 M311 639 L318 632 L325 639" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
c += tabbar(["Home","Health","Meds","Chat","Circle"],3,GUARD)

h = t(24,92,"Family",30,700)
h += bubble(16,130,250,["Walked Ocean Beach this","morning, photos tonight!"],False,"James")
h += rect(0,0,PW,PH,0,"#000",op=0.16)
h += glass(0,330,PW,430,34)+rect(150,342,60,5,2.5,"#c7c7cc")
h += t(24,386,"This looks like a health detail",20,700)
h += t(24,414,"Notes keep health details with Maggie's",14,400,MUTED)+t(24,434,"record and its access rules.",14,400,MUTED)
h += rect(24,452,312,68,16,"#f5f5f7")+t(40,480,"Mom's Metformin moved to",14,400)+t(40,500,"6 PM, 500 mg with dinner.",14,400)
h += pill(24,532,96,"Metformin","#fff1df","#9a4f00")+pill(128,532,80,"a dose","#fff1df","#9a4f00")
h += btn(24,574,312,"Save as a note",h=50,size=16)
h += btn(24,634,150,"Send anyway",False)+btn(186,634,150,"Edit",False)

m = t(24,92,"Family",34,700)
m += bubble(16,128,300,["Bringing noodle soup","from Clement Street","on Sunday."],False,"Sarah",large=True)
m += bubble(16,250,300,["Giants day game at","Oracle Park next week,","who's in?"],False,"James",large=True)
m += glass(16,388,328,190,28)+t(36,424,"You said",14,600,MUTED)
m += t(36,458,"Count me in, I'll bring",20,500)+t(36,486,"my lucky hat.",20,500)
m += btn(36,508,140,"Send",h=52,size=17,color=ELDER)+btn(186,508,138,"Try again",False,ELDER,h=52,size=17)
m += '<circle cx="180" cy="640" r="40" fill="#b84f00"/>'
m += '<rect x="171" y="618" width="18" height="30" rx="9" fill="#fff"/><path d="M164 640 Q164 656 180 656 Q196 656 196 640 M180 656 L180 664" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>'
m += t(180,708,"Tap to talk, or type instead",13,500,MUTED,"middle")

board("03-family-chat","Care Access Services · CC-164, CC-165","Private family chat with a health-detail guard",
  "One calm place for everyday family talk. Health details are steered into Notes, where access rules apply.",
  [phone(80,200,c,"Sarah · Family chat"),phone(470,200,h,"Health-detail hint"),phone(860,200,m,"Maggie · Voice reply")],
  [["Family only by default","Caregivers join by invite"],["Generic notifications","New message in Circle Care"],["Health-detail hint","Save as a note, send or edit"],["Voice reply for Maggie","Reads it back before sending"],["Large type and big targets","Chat tile on her home"]],
  [["Apple Messages","Bubbles, dictation, layout"],["Caring Village","Care-circle chat with roles"],["GrandPad","Senior-first voice messages"]])

# ---------- Board 4: evening recap ----------
r = t(24,92,"Good evening, Sarah",26,700)+t(24,118,"Maggie · Saturday",14,400,MUTED)
r += glass(16,140,328,480,28)
r += t(36,174,"EVENING RECAP",11,700,GUARD,ls=1.2)+t(36,204,"A calm day for Maggie.",22,700)
r += btn(214,226,114,"2 new in chat",False,GUARD,h=32,size=12)
cells=[("Medicines","5 of 5","All confirmed"),("Check-in","8:45 AM","4 of 5 routines done"),("Visits","Ana","9:00 AM to 1:00 PM"),("Her day","Calm","4 glasses · 2 of 3 meals"),("Tomorrow","10:30 AM","Dr. Lee, Mission Bay")]
for i,(k,v,sub) in enumerate(cells):
    col=i%2; row=i//2
    cx=32+col*152; cy=270+row*96
    r += rect(cx,cy,144,86,16,"#ffffff",op=0.75)+t(cx+12,cy+22,k,11,600,MUTED)
    if k=="Her day": r += face(cx+80,cy+8,"calm",22)
    r += t(cx+12,cy+50,v,19,700)+t(cx+12,cy+70,sub,11,400,MUTED)
r += t(36,600,"Health details stay in the app.",12,400,MUTED)
r += tabbar(["Home","Health","Meds","Chat","Circle"],0,GUARD)

r2 = t(24,92,"Good evening, Sarah",26,700)+t(24,118,"Maggie · Friday",14,400,MUTED)
r2 += glass(16,140,328,300,28)
r2 += t(36,174,"EVENING RECAP",11,700,GUARD,ls=1.2)+t(36,204,"1 dose needs a look.",22,700)
cells=[("Medicines","4 of 5","Not confirmed: Atorvastatin"),("Check-in","9:10 AM","5 of 5 routines done")]
for i,(k,v,sub) in enumerate(cells):
    cy=226+i*96
    r2 += rect(32,cy,296,86,16,"#ffffff",op=0.75)+t(44,cy+22,k,11,600,MUTED)+t(44,cy+50,v,19,700)+t(44,cy+70,sub,12,400,"#9a4f00" if i==0 else MUTED)
r2 += glass(16,456,328,90,24)+t(36,490,"Atorvastatin: 6 days left",15,600)+t(36,512,"A refill is on the Calendar for Nov 17.",13,400,MUTED)

lk = t(180,150,"Saturday, November 14",17,500,"#3a3a3c","middle")+t(180,236,"7:00",86,300,INK,"middle")
lk += glass(14,290,332,96,26)+rect(30,308,38,38,10,"#5e5ce6")+'<circle cx="49" cy="327" r="8" fill="none" stroke="#fff" stroke-width="2.4"/>'
lk += t(80,318,"CIRCLE CARE",11,700,MUTED,ls=1)+t(316,318,"now",11,500,MUTED,"end")
lk += t(80,340,"Update from Circle Care",14,600)+t(80,360,"Your evening recap is ready.",13,400,MUTED)
lk += t(180,690,"One notification at 7 PM. No health details.",12,500,"#3a3a3c","middle")

board("04-evening-recap","Guardian Dashboard · CC-191","Evening recap of Maggie's day",
  "From 6 PM, one calm card answers the question Sarah asks every night: how was Mom's day?",
  [phone(80,200,r,"Sarah · Calm day"),phone(470,200,r2,"Sarah · A day that needs a look"),phone(860,200,lk,"7 PM notification",bg="url(#lock)")],
  [["Headline first","Calm day, or what needs a look"],["Five cells, one glance","Meds, visits, mood, tomorrow"],["Respects Maggie's sharing","Her day shows Private if off"],["Links straight to action","Chat and medicines"],["One generic 7 PM alert","Nothing private on the lock screen"]],
  [["Apple Screen Time summary","A daily digest in one card"],["Oura daily readiness","Headline plus a few numbers"],["CaringBridge digest","Calm family updates"]])
print("done")
