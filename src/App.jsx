import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const BRANDS = [
  { id: "seven_smile", label: "Seven Smile" },
  { id: "indo_smile", label: "INDO Smile" },
  { id: "no_logo", label: "No LOGO" },
];

const LANGUAGES = [
  { id: "th", label: "TH" },
  { id: "en", label: "EN" },
];

const FILE_VARIANTS = BRANDS.flatMap((brand) =>
  LANGUAGES.map((language) => ({
    brand: brand.id,
    brandLabel: brand.label,
    language: language.id,
    languageLabel: language.label,
    field: `brochure_${brand.id}_${language.id}`,
  })),
);

const createEmptyForm = () => ({
  title: "",
  province: "",
  adult_price: "",
  child_price: "",
  park_included: false,
  thai_adult_park_fee: "",
  thai_child_park_fee: "",
  foreigner_adult_park_fee: "",
  foreigner_child_park_fee: "",
  note: "",
  sale_prices: [{ label: "Facebook Page", adult_profit: "", child_profit: "" }],
});

function createFormFromTour(tour) {
  return {
    title: tour.title || "",
    province: tour.province || "",
    adult_price: String(tour.adult_price ?? ""),
    child_price: String(tour.child_price ?? ""),
    park_included: Boolean(tour.park_included),
    thai_adult_park_fee: String(tour.thai_adult_park_fee ?? ""),
    thai_child_park_fee: String(tour.thai_child_park_fee ?? ""),
    foreigner_adult_park_fee: String(tour.foreigner_adult_park_fee ?? ""),
    foreigner_child_park_fee: String(tour.foreigner_child_park_fee ?? ""),
    note: tour.note || "",
    sale_prices:
      tour.sale_prices?.length > 0
        ? tour.sale_prices.map((salePrice) => ({
            label: salePrice.label || "",
            adult_profit: String(salePrice.adult_profit ?? ""),
            child_profit: String(salePrice.child_profit ?? ""),
          }))
        : [{ label: "Facebook Page", adult_profit: "", child_profit: "" }],
  };
}

const money = (value) =>
  Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 0,
  });

const numberValue = (value) => Number(value || 0);

function parkFeeFor(item, nationality, passengerType) {
  return numberValue(item[`${nationality}_${passengerType}_park_fee`]);
}

function salePriceFor(item, salePrice, nationality, passengerType) {
  return (
    numberValue(item[`${passengerType}_price`]) +
    parkFeeFor(item, nationality, passengerType) +
    numberValue(salePrice[`${passengerType}_profit`])
  );
}

async function readJson(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "The API did not return JSON. Please check that /api points to the PHP backend.",
    );
  }
}

async function convertImageToPng(blob) {
  if (blob.type === "image/png") return blob;

  const image = new Image();
  const objectUrl = URL.createObjectURL(blob);

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("Could not convert the image."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getBrandLabel(brandId) {
  return BRANDS.find((brand) => brand.id === brandId)?.label || brandId;
}

function getLanguageLabel(languageId) {
  return (
    LANGUAGES.find((language) => language.id === languageId)?.label ||
    languageId
  );
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 140);
}

function fileExtension(item) {
  const fileName = item.file?.file_name || item.file_name || item.file_url || "";
  const extension = String(fileName).split(".").pop();
  return extension && extension.length <= 5 ? extension.toLowerCase() : "jpg";
}

function brochureDownloadName(item) {
  const parts = [
    safeFileName(item.title),
    safeFileName(item.brand_label || getBrandLabel(item.brand)),
    safeFileName(item.language_label || getLanguageLabel(item.language)),
  ].filter(Boolean);

  return `${parts.join(" - ")}.${fileExtension(item)}`;
}

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [province, setProvince] = useState("all");
  const [brandFilter, setBrandFilter] = useState("seven_smile");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [adminOpen, setAdminOpen] = useState(window.location.hash === "#admin");
  const [isAuthed, setIsAuthed] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [form, setForm] = useState(createEmptyForm);
  const [editingTour, setEditingTour] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadBrochures = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_BASE}/brochures`);
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not load data.");
      setItems(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial API sync for the catalog.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBrochures();
  }, []);

  useEffect(() => {
    const handleHash = () => setAdminOpen(window.location.hash === "#admin");
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if (!adminOpen) return;

    let active = true;
    const restoreAdminSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/admin/session`);
        const data = await readJson(response);
        if (active && response.ok) {
          setIsAuthed(Boolean(data.authenticated));
        }
      } catch {
        if (active) setIsAuthed(false);
      }
    };

    restoreAdminSession();
    return () => {
      active = false;
    };
  }, [adminOpen]);

  const provinces = useMemo(
    () =>
      [...new Set(items.map((item) => item.province).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "th"),
      ),
    [items],
  );

  const salePriceLabels = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) =>
            (item.sale_prices || [])
              .map((salePrice) => salePrice.label)
              .filter(Boolean),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "en")),
    [items],
  );

  const filteredTours = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchText =
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.province.toLowerCase().includes(needle) ||
        (item.note || "").toLowerCase().includes(needle);
      const matchProvince = province === "all" || item.province === province;
      return matchText && matchProvince;
    });
  }, [items, province, query]);

  const brochureCards = useMemo(
    () =>
      filteredTours.flatMap((tour) =>
        (tour.files || [])
          .filter((file) => file.brand === brandFilter)
          .map((file) => ({
            ...tour,
            card_id: `${tour.id}-${file.id}`,
            file,
            file_url: file.file_url,
            mime_type: file.mime_type,
            brand: file.brand,
            language: file.language,
            brand_label: getBrandLabel(file.brand),
            language_label: getLanguageLabel(file.language),
          })),
      ),
    [brandFilter, filteredTours],
  );

  const brandCounts = useMemo(() => {
    const counts = Object.fromEntries(BRANDS.map((brand) => [brand.id, 0]));
    filteredTours.forEach((tour) => {
      BRANDS.forEach((brand) => {
        counts[brand.id] += (tour.files || []).filter(
          (file) => file.brand === brand.id,
        ).length;
      });
    });
    return counts;
  }, [filteredTours]);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const copyBrochure = async (item) => {
    try {
      setError("");

      if (item.mime_type === "application/pdf") {
        setError(
          "PDF files cannot be copied as images. Please download the file instead.",
        );
        return;
      }

      if (!navigator.clipboard?.write || !window.ClipboardItem) {
        setError(
          "This browser does not support copying images. Please download the file instead.",
        );
        return;
      }

      const response = await fetch(item.file_url);
      if (!response.ok) {
        setError("Could not load the brochure image for copying.");
        return;
      }

      const pngBlob = await convertImageToPng(await response.blob());
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      notify("Brochure image copied.");
    } catch {
      setError("Could not copy the image. Please download the file instead.");
    }
  };

  const login = async (event) => {
    event.preventDefault();
    setError("");
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      setError(data.error || "Could not sign in.");
      return;
    }
    setIsAuthed(true);
    setAdminPassword("");
  };

  const submitBrochure = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const payload = new FormData(formElement);
    payload.set("park_included", form.park_included ? "1" : "0");

    setSaving(true);
    setError("");

    try {
      const endpoint = editingTour
        ? `${API_BASE}/admin/brochures/${editingTour.id}`
        : `${API_BASE}/admin/brochures`;
      const response = await fetch(endpoint, {
        method: "POST",
        body: payload,
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not save.");
      setForm(createEmptyForm());
      setEditingTour(null);
      formElement.reset();
      await loadBrochures();
      notify(editingTour ? "Tour updated." : "Tour and brochures added.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEditTour = (tour) => {
    setEditingTour(tour);
    setForm(createFormFromTour(tour));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditTour = (formElement) => {
    setEditingTour(null);
    setForm(createEmptyForm());
    formElement?.reset();
  };

  const removeBrochure = async (item) => {
    if (
      !window.confirm(
        `Delete "${item.title}" and all brochure files for this tour?`,
      )
    )
      return;
    const response = await fetch(`${API_BASE}/admin/brochures/${item.id}`, {
      method: "DELETE",
    });
    const data = await readJson(response);
    if (!response.ok) {
      setError(data.error || "Could not delete.");
      return;
    }
    await loadBrochures();
    notify("Tour deleted.");
  };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">
              Seven Smile & INDO Smile
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Brochure & Tour Price Library
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.hash = adminOpen ? "" : "admin";
              setAdminOpen(!adminOpen);
            }}
            className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {adminOpen ? "Back to Library" : "Admin"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {toast && (
          <div className="fixed right-4 top-4 z-50 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            {toast}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {adminOpen ? (
          <AdminPanel
            adminPassword={adminPassword}
            form={form}
            editingTour={editingTour}
            isAuthed={isAuthed}
            items={items}
            login={login}
            provinces={provinces}
            cancelEditTour={cancelEditTour}
            removeBrochure={removeBrochure}
            salePriceLabels={salePriceLabels}
            saving={saving}
            setAdminPassword={setAdminPassword}
            setForm={setForm}
            startEditTour={startEditTour}
            submitBrochure={submitBrochure}
          />
        ) : (
          <PublicCatalog
            brandCounts={brandCounts}
            brandFilter={brandFilter}
            brochures={brochureCards}
            copyBrochure={copyBrochure}
            filteredTours={filteredTours}
            items={items}
            loading={loading}
            province={province}
            provinces={provinces}
            query={query}
            selected={selected}
            setBrandFilter={setBrandFilter}
            setProvince={setProvince}
            setQuery={setQuery}
            setSelected={setSelected}
          />
        )}
      </div>
    </main>
  );
}

function PublicCatalog({
  brandCounts,
  brandFilter,
  brochures,
  copyBrochure,
  filteredTours,
  items,
  loading,
  province,
  provinces,
  query,
  selected,
  setBrandFilter,
  setProvince,
  setQuery,
  setSelected,
}) {
  const hasFilters = query.trim() !== "" || province !== "all";
  const featuredProvinces = provinces.slice(0, 8);

  return (
    <>
      <section className="mb-6 space-y-4 border-b border-slate-200 pb-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Search brochures
            </span>
            <div className="relative">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by tour name, province, or note"
                className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 pr-10 text-base shadow-sm outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  X
                </button>
              )}
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Province
            </span>
            <select
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base shadow-sm outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            >
              <option value="all">All provinces</option>
              {provinces.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setQuery("");
              setProvince("all");
            }}
            disabled={!hasFilters}
            className="h-12 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {BRANDS.map((brand) => (
            <button
              type="button"
              onClick={() => setBrandFilter(brand.id)}
              className={`h-12 rounded-md px-4 text-sm font-bold shadow-sm transition ${
                brandFilter === brand.id
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
              key={brand.id}
            >
              {brand.label}
              <span
                className={`ml-2 text-xs ${brandFilter === brand.id ? "text-slate-300" : "text-slate-400"}`}
              >
                {brandCounts[brand.id] || 0}
              </span>
            </button>
          ))}
        </div>

        {featuredProvinces.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setProvince("all")}
              className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                province === "all"
                  ? "bg-cyan-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              All provinces
            </button>
            {featuredProvinces.map((name) => (
              <button
                type="button"
                onClick={() => setProvince(name)}
                className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                  province === name
                    ? "bg-cyan-700 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
                key={name}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            Showing {brochures.length} brochure files from{" "}
            {filteredTours.length} tours
          </p>
          <p className="text-sm text-slate-500">
            Current set: {getBrandLabel(brandFilter)}
          </p>
        </div>
        <p className="text-sm text-slate-500">{items.length} total tours</p>
      </div>

      {loading ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-600">
          Loading data...
        </div>
      ) : brochures.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-600">
          No brochures found for the selected set.
        </div>
      ) : (
        <section className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">
          {brochures.map((item) => (
            <BrochureCard
              item={item}
              key={item.card_id}
              setSelected={setSelected}
            />
          ))}
        </section>
      )}

      {selected && (
        <BrochureModal
          copyBrochure={copyBrochure}
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function BrochureCard({ item, setSelected }) {
  return (
    <article className="mb-5 break-inside-avoid">
      <button
        type="button"
        onClick={() => setSelected(item)}
        className="group relative block w-full cursor-zoom-in transition duration-200 hover:-translate-y-0.5 hover:opacity-95"
        aria-label={`Open brochure ${item.title} ${item.language_label}`}
      >
        <BrochurePreview item={item} compact />
        <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-xs font-bold text-slate-700 shadow-sm">
          {item.language_label}
        </span>
      </button>
    </article>
  );
}

function PriceBlock({ item }) {
  const salePrices = item.sale_prices || [];

  return (
    <div className="space-y-3 text-sm">
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">
          Calculated sale prices
        </h3>
        {salePrices.length === 0 ? (
          <div className="rounded-md bg-amber-50 p-3 text-amber-900">
            No profit settings have been added for this tour.
          </div>
        ) : (
          salePrices.map((salePrice) => (
            <div
              className="rounded-md border border-slate-200 bg-white p-3"
              key={salePrice.id}
            >
              <p className="mb-2 font-bold text-slate-900">{salePrice.label}</p>
              <div className="space-y-2">
                <SaleNationalityRow
                  item={item}
                  nationality="thai"
                  salePrice={salePrice}
                  title="Thai"
                />
                <SaleNationalityRow
                  item={item}
                  nationality="foreigner"
                  salePrice={salePrice}
                  title="Foreigner"
                />
              </div>
            </div>
          ))
        )}
      </section>

      <details className="rounded-md border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-3 py-2 font-bold text-slate-700">
          Net cost and park fee
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3">
          <div className="rounded-md bg-white p-3">
            <p className="text-slate-500">Adult net</p>
            <p className="text-lg font-bold">{money(item.adult_price)} THB</p>
          </div>
          <div className="rounded-md bg-white p-3">
            <p className="text-slate-500">Child net</p>
            <p className="text-lg font-bold">{money(item.child_price)} THB</p>
          </div>
          <div
            className={`col-span-2 space-y-1 rounded-md p-3 ${
              item.park_included
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900"
            }`}
          >
            <p className="font-semibold">
              {item.park_included
                ? "Net cost is marked as park-fee included"
                : "Net cost is marked as park-fee not included"}
            </p>
            <p>
              Thai: Adult {money(item.thai_adult_park_fee)} / Child{" "}
              {money(item.thai_child_park_fee)} THB
            </p>
            <p>
              Foreigner: Adult {money(item.foreigner_adult_park_fee)} / Child{" "}
              {money(item.foreigner_child_park_fee)} THB
            </p>
            <p className="text-xs opacity-80">
              Sale calculations always add these park fee fields.
            </p>
          </div>
        </div>
      </details>

      {item.note && <p className="line-clamp-3 text-slate-600">{item.note}</p>}
    </div>
  );
}

function SaleNationalityRow({ item, nationality, salePrice, title }) {
  const adultSale = salePriceFor(item, salePrice, nationality, "adult");
  const childSale = salePriceFor(item, salePrice, nationality, "child");
  const adultProfit = numberValue(salePrice.adult_profit);
  const childProfit = numberValue(salePrice.child_profit);

  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="mb-2 font-semibold text-slate-700">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-slate-500">Adult sale</p>
          <p className="text-xl font-bold">{money(adultSale)} THB</p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            Profit {money(adultProfit)} THB
          </p>
        </div>
        <div>
          <p className="text-slate-500">Child sale</p>
          <p className="text-xl font-bold">{money(childSale)} THB</p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            Profit {money(childProfit)} THB
          </p>
        </div>
      </div>
    </div>
  );
}

function BrochurePreview({ compact, item }) {
  if (item.mime_type === "application/pdf") {
    return (
      <div
        className={`flex ${compact ? "aspect-[3/4]" : "h-[70vh]"} items-center justify-center bg-white text-slate-700`}
      >
        <span className="border border-slate-200 px-4 py-3 text-sm font-bold">
          PDF Brochure
        </span>
      </div>
    );
  }

  return (
    <img
      src={item.file_url}
      alt={item.title}
      className={`${compact ? "h-auto" : "max-h-[70vh]"} w-full object-contain`}
      loading="lazy"
    />
  );
}

function BrochureModal({ copyBrochure, item, onClose }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 p-4">
      <div className="mx-auto grid max-w-6xl gap-4 rounded-md bg-white p-4 shadow-2xl lg:grid-cols-[1fr_360px]">
        <div className="bg-white">
          {item.mime_type === "application/pdf" ? (
            <iframe
              src={item.file_url}
              title={item.title}
              className="h-[70vh] w-full"
            />
          ) : (
            <BrochurePreview item={item} />
          )}
        </div>
        <aside className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">
                  {item.province}
                </span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                  {item.brand_label}
                </span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                  {item.language_label}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-bold leading-tight">
                {item.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-slate-300 px-3 font-bold"
            >
              X
            </button>
          </div>
          <PriceBlock item={item} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={item.mime_type === "application/pdf"}
              onClick={() => copyBrochure(item)}
              className="h-11 rounded-md bg-slate-900 px-4 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Copy image
            </button>
            <a
              href={item.file_url}
              download={brochureDownloadName(item)}
              className="flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 font-semibold hover:bg-slate-50"
            >
              Download
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AdminPanel({
  adminPassword,
  cancelEditTour,
  editingTour,
  form,
  isAuthed,
  items,
  login,
  provinces,
  removeBrochure,
  salePriceLabels,
  saving,
  setAdminPassword,
  setForm,
  startEditTour,
  submitBrochure,
}) {
  const [adminSearch, setAdminSearch] = useState("");
  const filteredAdminItems = useMemo(() => {
    const needle = adminSearch.trim().toLowerCase();
    if (!needle) return items;

    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.province.toLowerCase().includes(needle),
    );
  }, [adminSearch, items]);

  if (!isAuthed) {
    return (
      <section className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Admin Sign In</h2>
        <form onSubmit={login} className="space-y-3">
          <input
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            placeholder="Admin password"
            className="h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
          />
          <button
            type="submit"
            className="h-11 w-full rounded-md bg-slate-900 font-semibold text-white hover:bg-slate-700"
          >
            Sign in
          </button>
        </form>
      </section>
    );
  }

  const updateSalePrice = (index, key, value) => {
    setForm({
      ...form,
      sale_prices: form.sale_prices.map((salePrice, saleIndex) =>
        saleIndex === index ? { ...salePrice, [key]: value } : salePrice,
      ),
    });
  };

  const addSalePrice = () => {
    setForm({
      ...form,
      sale_prices: [
        ...form.sale_prices,
        { label: "", adult_profit: "", child_profit: "" },
      ],
    });
  };

  const removeSalePrice = (index) => {
    setForm({
      ...form,
      sale_prices: form.sale_prices.filter(
        (_, saleIndex) => saleIndex !== index,
      ),
    });
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[460px_1fr]">
      <form
        onSubmit={submitBrochure}
        className="h-fit rounded-md border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 text-xl font-bold">
              {editingTour ? "Edit Tour" : "Add Tour"}
            </h2>
            <p className="text-sm text-slate-500">
              {editingTour
                ? "Update shared details, profit settings, and replace brochure files if needed."
                : "Enter the shared price and details once, then attach the brochure files you have."}
            </p>
          </div>
          {editingTour && (
            <button
              type="button"
              onClick={(event) => cancelEditTour(event.currentTarget.form)}
              className="h-9 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
        <div className="grid gap-3">
          <Field label="Tour name">
            <input
              required
              name="title"
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              className="input"
            />
          </Field>
          <Field label="Province">
            <input
              required
              list="province-options"
              name="province"
              value={form.province}
              onChange={(event) =>
                setForm({ ...form, province: event.target.value })
              }
              placeholder="Select or type a province"
              className="input"
            />
            <datalist id="province-options">
              {provinces.map((name) => (
                <option value={name} key={name} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Adult price">
              <input
                required
                min="0"
                name="adult_price"
                type="number"
                value={form.adult_price}
                onChange={(event) =>
                  setForm({ ...form, adult_price: event.target.value })
                }
                className="input"
              />
            </Field>
            <Field label="Child price">
              <input
                required
                min="0"
                name="child_price"
                type="number"
                value={form.child_price}
                onChange={(event) =>
                  setForm({ ...form, child_price: event.target.value })
                }
                className="input"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 rounded-md bg-slate-50 p-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.park_included}
              onChange={(event) =>
                setForm({ ...form, park_included: event.target.checked })
              }
              className="h-4 w-4"
            />
            National park fee included
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Thai adult park fee">
              <input
                min="0"
                name="thai_adult_park_fee"
                type="number"
                value={form.thai_adult_park_fee}
                onChange={(event) =>
                  setForm({ ...form, thai_adult_park_fee: event.target.value })
                }
                className="input"
              />
            </Field>
            <Field label="Thai child park fee">
              <input
                min="0"
                name="thai_child_park_fee"
                type="number"
                value={form.thai_child_park_fee}
                onChange={(event) =>
                  setForm({ ...form, thai_child_park_fee: event.target.value })
                }
                className="input"
              />
            </Field>
            <Field label="Foreigner adult park fee">
              <input
                min="0"
                name="foreigner_adult_park_fee"
                type="number"
                value={form.foreigner_adult_park_fee}
                onChange={(event) =>
                  setForm({
                    ...form,
                    foreigner_adult_park_fee: event.target.value,
                  })
                }
                className="input"
              />
            </Field>
            <Field label="Foreigner child park fee">
              <input
                min="0"
                name="foreigner_child_park_fee"
                type="number"
                value={form.foreigner_child_park_fee}
                onChange={(event) =>
                  setForm({
                    ...form,
                    foreigner_child_park_fee: event.target.value,
                  })
                }
                className="input"
              />
            </Field>
          </div>

          <div className="rounded-md border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <p className="font-bold">Profit settings</p>
                <p className="text-sm text-slate-500">
                  Add target profit for each sales channel. Sale prices are
                  calculated automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={addSalePrice}
                className="h-9 shrink-0 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Add price
              </button>
            </div>
            <div className="grid gap-3 p-3">
              {form.sale_prices.map((salePrice, index) => (
                <div
                  className="rounded-md border border-slate-200 p-3"
                  key={index}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-700">
                      Price #{index + 1}
                    </p>
                    {form.sale_prices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSalePrice(index)}
                        className="text-sm font-semibold text-red-700 hover:text-red-900"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
                    <Field label="Price label">
                      <input
                        list="sale-price-label-options"
                        name="sale_label[]"
                        value={salePrice.label}
                        onChange={(event) =>
                          updateSalePrice(index, "label", event.target.value)
                        }
                        placeholder="Facebook Page"
                        className="input"
                      />
                      <datalist id="sale-price-label-options">
                        {salePriceLabels.map((label) => (
                          <option value={label} key={label} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="ADT profit">
                      <input
                        min="0"
                        name="sale_adult_profit[]"
                        type="number"
                        value={salePrice.adult_profit}
                        onChange={(event) =>
                          updateSalePrice(
                            index,
                            "adult_profit",
                            event.target.value,
                          )
                        }
                        className="input"
                      />
                    </Field>
                    <Field label="CHD profit">
                      <input
                        min="0"
                        name="sale_child_profit[]"
                        type="number"
                        value={salePrice.child_profit}
                        onChange={(event) =>
                          updateSalePrice(
                            index,
                            "child_profit",
                            event.target.value,
                          )
                        }
                        className="input"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Field label="Note">
            <textarea
              name="note"
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
              className="input min-h-24 py-2"
            />
          </Field>

          <div className="mt-2 rounded-md border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <p className="font-bold">Brochure files</p>
              <p className="text-sm text-slate-500">
                {editingTour
                  ? "Existing files stay unchanged unless you choose a replacement. Supports JPG, PNG, WEBP, and PDF."
                  : "Select at least 1 file. Supports JPG, PNG, WEBP, and PDF."}
              </p>
            </div>
            <div className="grid gap-3 p-3">
              {FILE_VARIANTS.map((variant) => {
                const existingFile = editingTour?.files?.find(
                  (file) =>
                    file.brand === variant.brand &&
                    file.language === variant.language,
                );

                return (
                  <Field
                    label={`${variant.brandLabel} (${variant.languageLabel})`}
                    key={variant.field}
                  >
                    {existingFile && (
                      <p className="mb-2 truncate text-sm text-slate-500">
                        Current:{" "}
                        <a
                          href={existingFile.file_url}
                          target="_blank"
                          className="font-semibold text-cyan-700 hover:underline"
                        >
                          {existingFile.original_name}
                        </a>
                      </p>
                    )}
                    <input
                      type="file"
                      name={variant.field}
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      className="block w-full text-sm file:mr-3 file:h-10 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:font-semibold file:text-white"
                    />
                  </Field>
                );
              })}
            </div>
          </div>

          <button
            disabled={saving}
            type="submit"
            className="h-11 rounded-md bg-cyan-700 font-semibold text-white hover:bg-cyan-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : editingTour ? "Update tour" : "Save tour"}
          </button>
        </div>
      </form>

      <div className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <h2 className="text-xl font-bold">All tours</h2>
          <div className="relative sm:justify-self-end">
            <input
              value={adminSearch}
              onChange={(event) => setAdminSearch(event.target.value)}
              placeholder="Search tours"
              className="h-10 w-full rounded-md border border-slate-300 px-3 pr-9 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 sm:w-72"
            />
            {adminSearch && (
              <button
                type="button"
                onClick={() => setAdminSearch("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear admin search"
              >
                X
              </button>
            )}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredAdminItems.map((item) => {
            const firstFile = item.files?.[0];
            return (
              <div
                className="grid gap-3 p-4 sm:grid-cols-[80px_1fr_auto] sm:items-center"
                key={item.id}
              >
                <div className="h-20 overflow-hidden rounded-md bg-slate-100">
                  {firstFile ? (
                    <BrochurePreview item={{ ...item, ...firstFile }} compact />
                  ) : null}
                </div>
                <div>
                  <p className="font-bold">{item.title}</p>
                  <p className="text-sm text-slate-600">
                    {item.province} | Adult {money(item.adult_price)} | Child{" "}
                    {money(item.child_price)}
                  </p>
                  <SalePriceSummary salePrices={item.sale_prices || []} />
                  <VariantSummary files={item.files || []} />
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => startEditTour(item)}
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBrochure(item)}
                    className="h-10 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="p-6 text-center text-slate-600">No data yet</div>
          )}
          {items.length > 0 && filteredAdminItems.length === 0 && (
            <div className="p-6 text-center text-slate-600">
              No tours match your search
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function VariantSummary({ files }) {
  if (files.length === 0)
    return <p className="mt-1 text-sm text-slate-400">No brochure files yet</p>;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {files.map((file) => (
        <span
          className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
          key={file.id}
        >
          {getBrandLabel(file.brand)} {getLanguageLabel(file.language)}
        </span>
      ))}
    </div>
  );
}

function SalePriceSummary({ salePrices }) {
  if (salePrices.length === 0)
    return <p className="mt-1 text-sm text-amber-700">No sale prices yet</p>;

  return (
    <p className="mt-1 text-sm text-slate-500">
      Sale: {salePrices.map((salePrice) => salePrice.label).join(", ")}
    </p>
  );
}

function Field({ children, label }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

export default App;
