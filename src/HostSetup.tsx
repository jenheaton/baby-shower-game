import React, { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ref, update } from "firebase/database";
import { ensureFirebase } from "./firebase";
import {
  type RoomState, type Item, type Rule,
  parseMoney, clean, cls, toCurrency
} from "./gameUtils";
import { SAMPLE_ITEMS } from "./gameData";

const db = ensureFirebase();

export function HostSetup({ room, onFinished }: { room: RoomState; onFinished: ()=>void }) {
  const [draft, setDraft] = useState({ name:"", price:"", imageUrl:"", note:"" });
  const [csv, setCsv] = useState("");
  const locked = Boolean(room.isSetupDone);
  const up = (patch: Partial<RoomState>) => update(ref(db, `rooms/${room.code}`), clean(patch));

  const addItem = async () => {
    if (locked) return alert("Setup is finished; items are locked.");
    const v = parseMoney(draft.price);
    if (!ensureFirebase() || !draft.name.trim() || v==null) return alert("Need item name and price (e.g., 28.99)");
    const item: Item = clean({ id: uuidv4(), name: draft.name.trim(), price: v, ...(draft.imageUrl?{imageUrl:draft.imageUrl}:{}) , ...(draft.note?{note:draft.note}:{}) });
    await up({ items: [...(room.items||[]), item] });
    setDraft({ name:"", price:"", imageUrl:"", note:"" });
  };

  const removeItem = async (id:string) => {
    if (locked) return alert("Setup is finished; items are locked.");
    await up({ items: (room.items||[]).filter(i=>i.id!==id) });
  };

  const saveItem = async (it: Item) => {
    if (locked) return;
    const items = (room.items||[]).map(i => i.id===it.id ? clean(it) : i);
    await up({ items });
  };


  const setRule = (rule:Rule)=> up({ rule });
  const setRoundTime = (sec:number)=> up({ roundDurationSec: sec });
  const setTopScores = (count:number)=> up({ topScoresCount: count });
  const setTopBids = (count:number)=> up({ topBidsCount: count });

  const loadSamples = async () => {
    if (locked) return;
    await up({ items: [...(room.items||[]), ...SAMPLE_ITEMS.map(it=>clean({...it,id:uuidv4()}))] });
  };

  const exportCsv = () => {
    const rows = [["name","price","imageUrl","note"],
      ...(room.items||[]).map(i=>[i.name, i.price, i.imageUrl||"", i.note||""])
    ];
    const csv = rows.map(r=>r.map(v=>String(v).replace(/"/g,'""')).map(v=>`"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `baby-items-${room.code}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const importCsv = async () => {
    if (locked) return;
    const lines = csv.split(/\n|\r/).map(l=>l.trim()).filter(Boolean);
    const acc: Item[] = [...(room.items||[])];
    for (const line of lines) {
      const [name, priceStr, imageUrl, note] = line.split(",");
      const v = parseMoney(priceStr||""); if (!name || v==null) continue;
      const it: Item = clean({ id: uuidv4(), name, price: v, ...(imageUrl?{imageUrl}:{}) , ...(note?{note}:{}) });
      acc.push(it);
    }
    await up({ items: acc });
    setCsv("");
  };

  const finishSetup = async () => {
    if (!room.items?.length) return alert("Add at least 1 item to play.");
    await up({ isSetupDone: true, status: "lobby" });
    onFinished(); // take host straight to Game tab
  };

  const items = room.items||[];

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Items */}
      <div className="bg-white rounded-2xl p-4 shadow-lg md:col-span-2 border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="font-semibold mb-3">Items ({items.length})</div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={loadSamples} disabled={locked}>Load sample items ({SAMPLE_ITEMS.length})</button>
            <button className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-colors" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        <ul className="divide-y">
          {items.map((it, idx)=>(
            <EditableItem key={it.id} it={it} idx={idx} onSave={saveItem} onRemove={()=>removeItem(it.id)} disabled={locked}/>
          ))}
          {!items.length && <li className="py-2 text-sm opacity-70">No items yet.</li>}
        </ul>
      </div>

      {/* Add item + CSV + settings */}
      <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-200">
        <div className="font-semibold mb-2">Add item</div>
        <input className="w-full px-3 py-2 rounded-lg border border-gray-300 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Name" value={draft.name} onChange={(e)=>setDraft(p=>({...p,name:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-lg border border-gray-300 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Price (e.g., 28.99)" value={draft.price} onChange={(e)=>setDraft(p=>({...p,price:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-lg border border-gray-300 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Image URL (optional)" value={draft.imageUrl} onChange={(e)=>setDraft(p=>({...p,imageUrl:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-lg border border-gray-300 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Note (optional)" value={draft.note} onChange={(e)=>setDraft(p=>({...p,note:e.target.value}))} disabled={locked}/>
        <button onClick={addItem} disabled={locked} className={cls("w-full px-3 py-2 rounded-lg text-white transition-colors", locked?"bg-gray-300 cursor-not-allowed":"bg-red-600 hover:bg-red-700")}>Add</button>

        <div className="mt-4 text-xs opacity-70">CSV quick add (name,price,imageUrl?,note?,isTest?)</div>
        <textarea className="w-full h-24 px-3 py-2 rounded-lg border border-gray-300 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder={`Pacifiers,7.99,https://...\nHuggies Diapers,28.49,,"true"`} value={csv} onChange={(e)=>setCsv(e.target.value)} disabled={locked}/>
        <button onClick={importCsv} disabled={locked} className={cls("w-full px-3 py-2 rounded-lg text-white transition-colors", locked?"bg-gray-300 cursor-not-allowed":"bg-blue-600 hover:bg-blue-700")}>Import CSV</button>

        <div className="mt-6 text-xs opacity-60">Rules</div>
        <div className="flex gap-2 mt-1">
          <button onClick={()=>setRule("closest_without_over")} disabled={locked} className={cls("px-3 py-2 rounded-lg text-sm transition-colors", room.rule==="closest_without_over"?"bg-gray-800 text-white":"bg-white border border-gray-300 hover:bg-gray-50", locked && "opacity-50 cursor-not-allowed")}>Closest w/o going over</button>
          <button onClick={()=>setRule("closest_overall")} disabled={locked} className={cls("px-3 py-2 rounded-lg text-sm transition-colors", room.rule==="closest_overall"?"bg-gray-800 text-white":"bg-white border border-gray-300 hover:bg-gray-50", locked && "opacity-50 cursor-not-allowed")}>Closest overall</button>
        </div>

        <div className="mt-3 text-xs opacity-60">Round duration</div>
        <div className="flex gap-2 mt-1">
          {[35,45,60].map(s=>(
            <button key={s} onClick={()=>setRoundTime(s)} disabled={locked} className={cls("px-3 py-2 rounded-lg text-sm transition-colors", room.roundDurationSec===s?"bg-gray-800 text-white":"bg-white border border-gray-300 hover:bg-gray-50", locked && "opacity-50 cursor-not-allowed")}>{s}s</button>
          ))}
        </div>

        <div className="mt-3 text-xs opacity-60">Top scores to display</div>
        <div className="flex gap-2 mt-1">
          {[3,5,7,10].map(n=>(
            <button key={n} onClick={()=>setTopScores(n)} disabled={locked} className={cls("px-3 py-2 rounded-lg text-sm transition-colors", (room.topScoresCount ?? 5)===n?"bg-gray-800 text-white":"bg-white border border-gray-300 hover:bg-gray-50", locked && "opacity-50 cursor-not-allowed")}>{n}</button>
          ))}
        </div>

        <div className="mt-3 text-xs opacity-60">Top bids to display</div>
        <div className="flex gap-2 mt-1">
          {[3,5,7,10].map(n=>(
            <button key={n} onClick={()=>setTopBids(n)} disabled={locked} className={cls("px-3 py-2 rounded-lg text-sm transition-colors", (room.topBidsCount ?? 5)===n?"bg-gray-800 text-white":"bg-white border border-gray-300 hover:bg-gray-50", locked && "opacity-50 cursor-not-allowed")}>{n}</button>
          ))}
        </div>

        <div className="mt-6">
          <button onClick={finishSetup} disabled={locked} className="w-full px-3 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors">
            Finish setup & invite players
          </button>
          <div className="text-xs mt-2 text-rose-700">
            {locked ? "Setup is finished. Items and rules are locked." : "After finishing setup, items and rules cannot be changed."}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableItem({ it, idx, onSave, onRemove, disabled }:{
  it: Item; idx:number; onSave:(i:Item)=>void; onRemove:()=>void; disabled:boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [local, setLocal] = useState<Item>(it);

  useEffect(()=>setLocal(it),[it.id]);

  const commit = () => {
    const v = parseMoney(String(local.price));
    if (v==null || !local.name.trim()) return alert("Name and price required.");
    onSave(clean({...local, price:v})); setEdit(false);
  };

  return (
    <li className="py-2 flex items-center gap-3">
      {it.imageUrl && <img src={it.imageUrl} className="w-14 h-14 object-cover rounded-lg border border-gray-200" alt="" />}
      <div className="flex-1">
        {!edit ? (
          <>
            <div className="font-medium">{idx+1}. {it.name}</div>
            <div className="text-xs opacity-60">True price: {toCurrency(it.price)} {it.note?`• ${it.note}`:""}</div>
          </>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            <input className="px-2 py-1 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={local.name} onChange={e=>setLocal(p=>({...p,name:e.target.value}))}/>
            <input className="px-2 py-1 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={String(local.price)} onChange={e=>setLocal(p=>({...p,price: parseMoney(e.target.value)??0}))}/>
            <input className="px-2 py-1 rounded-lg border border-gray-300 md:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Image URL" value={local.imageUrl||""} onChange={e=>setLocal(p=>({...p,imageUrl:e.target.value||undefined}))}/>
            <input className="px-2 py-1 rounded-lg border border-gray-300 md:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Note" value={local.note||""} onChange={e=>setLocal(p=>({...p,note:e.target.value||undefined}))}/>
          </div>
        )}
      </div>
      {!edit ? (
        <div className="flex gap-2">
          <button className="text-xs px-2 py-1 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors" onClick={()=>setEdit(true)} disabled={disabled}>Edit</button>
          <button className="text-xs px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 transition-colors" onClick={onRemove} disabled={disabled}>Remove</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className="text-xs px-2 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={commit} disabled={disabled}>Save</button>
          <button className="text-xs px-2 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors" onClick={()=>{ setLocal(it); setEdit(false); }} disabled={disabled}>Cancel</button>
        </div>
      )}
    </li>
  );
}