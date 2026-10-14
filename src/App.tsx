import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ShoppingCart,
  X,
  Plus,
  Minus,
  Check,
  CheckCircle2,
  AlertCircle,
  Phone,
  Sparkles,
  Package,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Download,
  Copy,
  Clock,
  Layers,
  Search,
  ExternalLink,
  ShieldCheck,
  Tag,
  Info,
  Truck,
  Building2,
  MapPin,
  Trash2,
  RefreshCw,
  MessageSquare
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

const WORKER_URL = "https://ib-v2.hsgglobalpteltd.workers.dev";

interface Brand {
  id: string;
  brand_ids?: string[];
  display_name: string;
  logo_image?: string;
  allow_custom_mix: boolean;
  mix_carton_size: number;
  sort_order: number;
}

interface Product {
  sku: string;
  brand_id: string;
  display_name: string;
  image: string;
  category?: string;
  carton_pcs: number;
  carton_h_mm?: string | number;
  carton_w_mm?: string | number;
  carton_l_mm?: string | number;
  carton_weight?: string | number;
  price_per_piece: number;
  normal_carton_price?: number;
  slash_price?: number | null;
  carton_price: number;
  status: "in_stock" | "out_of_stock" | "hidden";
  badge_text: string;
  product_meta: any;
  sort_order: number;
}

interface PriceRule {
  id: string;
  name: string;
  rule_type: "volume_tier" | "spend_threshold" | "promo_code";
  min_cartons: number;
  min_spend: number;
  promo_code: string;
  discount_type: "flat_amount" | "percentage" | "per_carton";
  discount_value: number;
  is_active: boolean;
  usage_limit?: number | null;
  used_count?: number;
  is_limit_reached?: boolean;
}

interface HeroSlide {
  id: string;
  badge_text?: string;
  title: string;
  subtitle: string;
  bg_image?: string;
  cta_text?: string;
  cta_link?: string;
  tags?: string[];
}

interface ShopSettings {
  id: string;
  is_store_open: boolean;
  pause_notice_message: string;
  company_name: string;
  company_uen: string;
  company_address: string;
  whatsapp_number: string;
  support_email: string;
  paynow_uen: string;
  paynow_merchant_name: string;
  order_ref_prefix: string;
  min_order_cartons: number;
  delivery_fee: number;
  free_delivery_threshold: number;
  estimated_delivery_days: string;
  delivery_terms: string;
  refund_policy: string;
  hero_slides?: HeroSlide[];
  warehouse_address?: string;
  store_person_contact?: string;
  store_person_name?: string;
  pickup_hours?: string;
  allow_self_pickup?: boolean;
  show_hero_section?: boolean;
}

// Carton Size Group for Custom Mix Builder
interface CartonSizeGroup {
  key: string;
  label: string;
  carton_pcs: number;
  dimensions_text: string;
  carton_l_mm: number;
  carton_w_mm: number;
  carton_h_mm: number;
  products: Product[];
}

// Cart Item Types
interface LooseBottlePick {
  sku: string;
  flavor: string;
  qty: number;
  price_per_piece: number;
}

interface CartCarton {
  id: string;
  carton_type: "standard" | "custom_mix";
  brand_id: string;
  sku?: string;
  name: string;
  carton_qty: number;
  carton_price: number;
  price_per_piece?: number;
  loose_bottles?: LooseBottlePick[];
  carton_group_key?: string;
  dimensions_text?: string;
  carton_pcs?: number;
}

const getBrandCartonGroups = (brandIdOrBrand: string | Brand, allProducts: Product[]): CartonSizeGroup[] => {
  let idSet: Set<string>;
  if (typeof brandIdOrBrand === "string") {
    idSet = new Set([brandIdOrBrand]);
  } else {
    idSet = new Set(brandIdOrBrand.brand_ids && brandIdOrBrand.brand_ids.length > 0 ? brandIdOrBrand.brand_ids : [brandIdOrBrand.id]);
  }
  const brandProducts = allProducts.filter((p) => idSet.has(p.brand_id) && p.status === "in_stock");
  const groupMap = new Map<string, Product[]>();

  for (const p of brandProducts) {
    const l = Math.round(Number(p.carton_l_mm || 0));
    const w = Math.round(Number(p.carton_w_mm || 0));
    const h = Math.round(Number(p.carton_h_mm || 0));
    const pcs = Math.round(Number(p.carton_pcs || 24));

    // Base carton size grouping on dimensions L x W x H and carton capacity
    const key = l > 0 && w > 0 && h > 0 ? `${l}x${w}x${h}_${pcs}` : `pcs_${pcs}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(p);
  }

  const groups: CartonSizeGroup[] = [];
  groupMap.forEach((prods, key) => {
    // If the carton size only has 1 SKU, it cannot be mixed with anything, so hide it
    if (prods.length < 2) return;

    const first = prods[0];
    const l = Math.round(Number(first.carton_l_mm || 0));
    const w = Math.round(Number(first.carton_w_mm || 0));
    const h = Math.round(Number(first.carton_h_mm || 0));
    const pcs = Math.round(Number(first.carton_pcs || 24));

    // Extract common packaging/bottle size tag from title e.g. 325ML, 500ML, 400G
    const sizeMatches = prods.map((pr) => {
      const m = pr.display_name.match(/(\d+(?:\.\d+)?\s*(?:ML|L|G|KG))/i);
      return m ? m[1].toUpperCase().replace(/\s+/, "") : "";
    });
    const commonSize = sizeMatches.every((s) => s && s === sizeMatches[0]) ? sizeMatches[0] : "";

    let label = `${pcs} Pcs Carton`;
    if (commonSize) {
      label = `${commonSize} Carton (${pcs} pcs)`;
    }

    groups.push({
      key,
      label,
      carton_pcs: pcs,
      dimensions_text: "",
      carton_l_mm: l,
      carton_w_mm: w,
      carton_h_mm: h,
      products: prods
    });
  });

  return groups;
};

export default function App() {
  // State: Data
  const [loading, setLoading] = useState<boolean>(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [settings, setSettings] = useState<ShopSettings>({
    id: "default",
    is_store_open: true,
    pause_notice_message: "We are currently preparing existing orders. Shop will reopen soon.",
    company_name: "HSG GLOBAL PTE. LTD.",
    company_uen: "202301234K",
    company_address: "Singapore",
    whatsapp_number: "+65 9123 4567",
    support_email: "sales@hsgglobal.sg",
    paynow_uen: "202301234K",
    paynow_merchant_name: "HSG GLOBAL PTE LTD",
    order_ref_prefix: "HSG-",
    min_order_cartons: 2,
    delivery_fee: 5.0,
    free_delivery_threshold: 50.0,
    estimated_delivery_days: "2 - 3 business days",
    delivery_terms: "Islandwide delivery within 2-3 business days. Delivery hours: Mon-Fri 10am-7pm.",
    refund_policy: "Goods once sold are non-refundable except for damaged or defective items reported within 24 hours of delivery.",
    warehouse_address: "9 Eunos Ave 8A, EUNOS INDUSTRIAL ESTATE, Singapore 409461",
    store_person_contact: "+65 8234 5678",
    store_person_name: "Warehouse Store Person",
    pickup_hours: "Mon - Fri: 10:00 AM - 6:00 PM",
    allow_self_pickup: true,
    show_hero_section: true
  });

  // Delivery Method ("doorstep" | "pickup")
  const [deliveryMethod, setDeliveryMethod] = useState<"doorstep" | "pickup">("doorstep");

  // Navigation & Filter
  const [selectedCategory, setSelectedCategory] = useState<string>("Beverage");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("all");

  // Cart state persisted in localStorage
  const [cart, setCart] = useState<CartCarton[]>(() => {
    try {
      const saved = localStorage.getItem("hsg_shop_cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to read cart from localStorage", e);
    }
    return [];
  });

  const [cartDrawerOpen, setCartDrawerOpen] = useState<boolean>(false);
  const [promoCodeInput, setPromoCodeInput] = useState<string>("");
  const [showPromoInput, setShowPromoInput] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem("hsg_shop_promo"));
    } catch {
      return false;
    }
  });

  // Persist cart changes
  useEffect(() => {
    try {
      localStorage.setItem("hsg_shop_cart", JSON.stringify(cart));
    } catch (e) {
      console.warn("Failed to persist cart to localStorage", e);
    }
  }, [cart]);

  // Hero Slider State & Autoplay
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const slides = useMemo<HeroSlide[]>(() => {
    if (settings.hero_slides && settings.hero_slides.length > 0) {
      return settings.hero_slides.slice(0, 5);
    }
    return [
      {
        id: "default",
        badge_text: "Official Direct Storefront",
        title: "HSG GLOBAL GOODS DIRECT TO YOUR DOOR.",
        subtitle:
          "Enjoy wholesale direct carton pricing across our signature food, beverage & consumer goods brands. Mix any combination of varieties in a carton or buy standard cases with fast islandwide delivery.",
        tags: ["Min. 2 Cartons", "Carton Mix & Match", "Dynamic SGQR"]
      }
    ];
  }, [settings.hero_slides]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [slides.length]);

  // Top Announcement Bar Slider (Mobile)
  const [announcementIndex, setAnnouncementIndex] = useState<number>(0);
  const announcementSlides = useMemo(() => [
    {
      icon: <Truck size={13} className="text-[#D3E3FD] shrink-0" />,
      text: "Islandwide Singapore Delivery"
    },
    {
      icon: <Sparkles size={13} className="text-[#D3E3FD] shrink-0" />,
      text: `Free delivery on orders over $${settings.free_delivery_threshold} SGD`
    },
    {
      icon: <Building2 size={13} className="text-[#D3E3FD] shrink-0" />,
      text: "Self-Pickup in Eunos Warehouse"
    }
  ], [settings.free_delivery_threshold]);

  useEffect(() => {
    if (announcementSlides.length <= 1) return;
    const interval = setInterval(() => {
      setAnnouncementIndex((prev) => (prev + 1) % announcementSlides.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [announcementSlides.length]);

  const [appliedPromoCode, setAppliedPromoCode] = useState<string>(() => {
    try {
      return localStorage.getItem("hsg_shop_promo") || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      if (appliedPromoCode) {
        localStorage.setItem("hsg_shop_promo", appliedPromoCode);
      } else {
        localStorage.removeItem("hsg_shop_promo");
      }
    } catch (e) {
      console.warn("Failed to persist promo code to localStorage", e);
    }
  }, [appliedPromoCode]);

  // Custom Mix Builder Modal
  const [mixBuilderOpen, setMixBuilderOpen] = useState<boolean>(false);
  const [mixBrand, setMixBrand] = useState<Brand | null>(null);
  const [mixSelections, setMixSelections] = useState<Record<string, number>>({});
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [selectedCartonGroupKey, setSelectedCartonGroupKey] = useState<string>("");

  // Active Order & SGQR with 5-Minute Timer
  const [createdOrder, setCreatedOrder] = useState<any | null>(() => {
    try {
      const saved = localStorage.getItem("hsg_pending_order");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [sgqrPayload, setSgqrPayload] = useState<string>(() => {
    try {
      return localStorage.getItem("hsg_pending_sgqr") || "";
    } catch {
      return "";
    }
  });
  const [paymentExpiresAt, setPaymentExpiresAt] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("hsg_payment_expires_at");
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(300);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<boolean>(false);
  const [copiedToastText, setCopiedToastText] = useState<string>("");
  const [expireToast, setExpireToast] = useState<boolean>(false);

  // Checkout & Payment Modals
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(() => {
    try {
      const savedExpires = localStorage.getItem("hsg_payment_expires_at");
      const savedOrder = localStorage.getItem("hsg_pending_order");
      if (savedExpires && savedOrder) {
        return parseInt(savedExpires, 10) > Date.now();
      }
    } catch {}
    return false;
  });
  const [paymentConfirmedTick, setPaymentConfirmedTick] = useState<boolean>(false);
  const [canPayNowTick, setCanPayNowTick] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  // Tracking Screen Route (e.g. /order/HSG-XXXX or ?ref=HSG-XXXX)
  const [trackingOrderRef, setTrackingOrderRef] = useState<string>("");
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);

  // Customer Form with localStorage persistence
  const COUNTRY_CODES = ["+65", "+60", "+91", "+62", "+63", "+880", "+84", "+66", "+86"];

  const [phoneCountryCode, setPhoneCountryCode] = useState<string>(() => {
    try {
      return localStorage.getItem("hsg_customer_country_code") || "+65";
    } catch {
      return "+65";
    }
  });

  const [phoneBody, setPhoneBody] = useState<string>(() => {
    try {
      const savedPhone = localStorage.getItem("hsg_customer_phone") || "";
      const matched = ["+880", "+65", "+60", "+91", "+62", "+63", "+84", "+66", "+86"].find((c) =>
        savedPhone.startsWith(c)
      );
      if (matched) {
        return savedPhone.slice(matched.length).trim();
      }
      return savedPhone;
    } catch {
      return "";
    }
  });

  const customerPhone = useMemo(() => {
    const clean = phoneBody.trim();
    return clean ? `${phoneCountryCode} ${clean}` : "";
  }, [phoneCountryCode, phoneBody]);

  const [customerName, setCustomerName] = useState<string>(() => {
    try { return localStorage.getItem("hsg_customer_name") || ""; } catch { return ""; }
  });
  const [customerEmail, setCustomerEmail] = useState<string>(() => {
    try { return localStorage.getItem("hsg_customer_email") || ""; } catch { return ""; }
  });
  const [postalCode, setPostalCode] = useState<string>(() => {
    try { return localStorage.getItem("hsg_customer_postal") || ""; } catch { return ""; }
  });
  const [deliveryAddress, setDeliveryAddress] = useState<string>(() => {
    try { return localStorage.getItem("hsg_customer_address") || ""; } catch { return ""; }
  });
  const [unitNo, setUnitNo] = useState<string>(() => {
    try { return localStorage.getItem("hsg_customer_unit") || ""; } catch { return ""; }
  });
  const [deliveryNotes, setDeliveryNotes] = useState<string>("");

  const isCheckoutFormValid = useMemo(() => {
    const hasName = customerName.trim().length > 0;
    const cleanPhone = phoneBody.replace(/[^0-9]/g, "");
    const hasPhone = cleanPhone.length >= 8;
    const isPickup = deliveryMethod === "pickup";
    const hasAddress = isPickup || (postalCode.trim().length >= 6 && deliveryAddress.trim().length > 0);
    return hasName && hasPhone && hasAddress && canPayNowTick;
  }, [customerName, phoneBody, deliveryMethod, postalCode, deliveryAddress, canPayNowTick]);

  useEffect(() => {
    try {
      if (customerName) localStorage.setItem("hsg_customer_name", customerName);
      if (phoneCountryCode) localStorage.setItem("hsg_customer_country_code", phoneCountryCode);
      if (customerPhone) localStorage.setItem("hsg_customer_phone", customerPhone);
      if (customerEmail) localStorage.setItem("hsg_customer_email", customerEmail);
      if (postalCode) localStorage.setItem("hsg_customer_postal", postalCode);
      if (deliveryAddress) localStorage.setItem("hsg_customer_address", deliveryAddress);
      if (unitNo) localStorage.setItem("hsg_customer_unit", unitNo);
    } catch (e) {
      console.warn("Failed to persist customer details to localStorage", e);
    }
  }, [customerName, phoneCountryCode, customerPhone, customerEmail, postalCode, deliveryAddress, unitNo]);

  // Policy Modals
  const [policyModal, setPolicyModal] = useState<"terms" | "refund" | null>(null);

  // 1. Initial Load & Check URL parameters for Order Tracking
  useEffect(() => {
    // Check if query has ?ref=HSG-XXXX or ?track=HSG-XXXX
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get("ref") || params.get("track");
    if (refParam) {
      setTrackingOrderRef(refParam);
      loadTrackedOrder(refParam);
    }

    // Fetch Catalog Data
    fetchCatalog();
  }, []);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WORKER_URL}/api/shop/catalog`);
      if (!res.ok) throw new Error("Failed to load storefront catalog");
      const data = await res.json();
      if (data.success) {
        setBrands(data.brands || []);
        setProducts(data.products || []);
        setPriceRules(data.price_rules || []);
        if (data.settings) setSettings(data.settings);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTrackedOrder = async (ref: string) => {
    setTrackingLoading(true);
    try {
      const res = await fetch(`${WORKER_URL}/api/shop/order-status?ref=${encodeURIComponent(ref)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setTrackedOrder(data.order);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTrackingLoading(false);
    }
  };

  // Auto-poll tracked order status if payment is not yet verified
  useEffect(() => {
    if (!trackedOrder || trackedOrder.payment_status === "verified") return;

    const interval = setInterval(() => {
      fetch(`${WORKER_URL}/api/shop/order-status?ref=${encodeURIComponent(trackedOrder.order_ref)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.order) {
            setTrackedOrder(data.order);
          }
        })
        .catch(() => {});
    }, 8000);

    return () => clearInterval(interval);
  }, [trackedOrder]);

  // Derived unique categories across active products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const cat = p.category || p.product_meta?.Category || (p.product_meta as any)?.category;
      if (cat && typeof cat === "string" && cat.trim()) {
        set.add(cat.trim());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  // Ensure default category is "Beverage" or first available category once products load
  useEffect(() => {
    if (categories.length > 0) {
      const isSelectedValid = categories.some((c) => c.toLowerCase() === selectedCategory.toLowerCase());
      if (!isSelectedValid) {
        const beverageMatch = categories.find((c) => c.toLowerCase() === "beverage");
        setSelectedCategory(beverageMatch || categories[0]);
      }
    }
  }, [categories, selectedCategory]);

  // Combine brands sharing the same display_name (case-insensitive)
  const combinedBrands = useMemo(() => {
    const map = new Map<string, Brand>();
    for (const b of brands) {
      const nameKey = (b.display_name || b.id).trim().toLowerCase();
      if (!map.has(nameKey)) {
        map.set(nameKey, {
          ...b,
          brand_ids: b.brand_ids && b.brand_ids.length > 0 ? [...b.brand_ids] : [b.id]
        });
      } else {
        const existing = map.get(nameKey)!;
        const currentIds = existing.brand_ids || [existing.id];
        const newIds = b.brand_ids && b.brand_ids.length > 0 ? b.brand_ids : [b.id];
        for (const nid of newIds) {
          if (!currentIds.includes(nid)) {
            currentIds.push(nid);
          }
        }
        existing.brand_ids = currentIds;
        if (!existing.logo_image && b.logo_image) {
          existing.logo_image = b.logo_image;
        }
        if (b.allow_custom_mix) {
          existing.allow_custom_mix = true;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const cmp = (a.id || "").localeCompare(b.id || "");
      if (cmp !== 0) return cmp;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }, [brands]);

  // Derived brands available in the selected category
  const visibleBrands = useMemo(() => {
    if (selectedCategory === "all") return combinedBrands;
    const brandIdsInCat = new Set(
      products
        .filter((p) => {
          const cat = p.category || p.product_meta?.Category || (p.product_meta as any)?.category || "Other";
          return cat.toLowerCase() === selectedCategory.toLowerCase();
        })
        .map((p) => p.brand_id)
    );
    return combinedBrands.filter((b) => {
      const ids = b.brand_ids && b.brand_ids.length > 0 ? b.brand_ids : [b.id];
      return ids.some((id) => brandIdsInCat.has(id));
    });
  }, [combinedBrands, products, selectedCategory]);

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    if (selectedBrandId !== "all") {
      const currentBrand = combinedBrands.find((b) => b.id === selectedBrandId);
      const allowedIds = currentBrand ? (currentBrand.brand_ids || [currentBrand.id]) : [selectedBrandId];
      const brandHasProdsInCat = products.some((p) => {
        const prodCat = p.category || p.product_meta?.Category || (p.product_meta as any)?.category || "Other";
        return allowedIds.includes(p.brand_id) && prodCat.toLowerCase() === cat.toLowerCase();
      });
      if (!brandHasProdsInCat) {
        setSelectedBrandId("all");
      }
    }
  };

  // Filtered Products for Display
  const displayedProducts = useMemo(() => {
    const list = products.filter((p) => {
      if (p.status === "hidden") return false;

      // Category filter
      if (selectedCategory !== "all") {
        const cat = p.category || p.product_meta?.Category || (p.product_meta as any)?.category || "Other";
        if (cat.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      }

      // Brand filter
      if (selectedBrandId !== "all") {
        const currentBrand = combinedBrands.find((b) => b.id === selectedBrandId);
        const allowedIds = currentBrand ? (currentBrand.brand_ids || [currentBrand.id]) : [selectedBrandId];
        if (!allowedIds.includes(p.brand_id)) return false;
      }

      return true;
    });

    // Sort products by brand_id, then sort_order, then sku
    return list.slice().sort((a, b) => {
      const brandCompare = (a.brand_id || "").localeCompare(b.brand_id || "");
      if (brandCompare !== 0) return brandCompare;
      const orderA = typeof a.sort_order === "number" ? a.sort_order : 9999;
      const orderB = typeof b.sort_order === "number" ? b.sort_order : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.sku || "").localeCompare(b.sku || "");
    });
  }, [products, selectedCategory, selectedBrandId, combinedBrands]);

  // Cart Calculations
  const totalCartons = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.carton_qty, 0);
  }, [cart]);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.carton_price * item.carton_qty, 0);
  }, [cart]);

  // Auto-Discount Calculation
  const discountInfo = useMemo(() => {
    let bestDiscount = 0;
    let ruleName = "";
    let promoError = "";
    let promoDesc = "";

    // 1. Check Volume Tier Rules
    for (const rule of priceRules) {
      if (rule.rule_type === "volume_tier" && rule.is_active && totalCartons >= rule.min_cartons) {
        let disc = 0;
        if (rule.discount_type === "flat_amount") {
          disc = rule.discount_value;
        } else if (rule.discount_type === "percentage") {
          disc = (subtotal * rule.discount_value) / 100;
        } else if (rule.discount_type === "per_carton") {
          disc = rule.discount_value * totalCartons;
        }

        if (disc > bestDiscount) {
          bestDiscount = disc;
          ruleName = rule.name;
        }
      }
    }

    // 2. Check Spend Threshold Rules
    for (const rule of priceRules) {
      if (rule.rule_type === "spend_threshold" && rule.is_active && subtotal >= rule.min_spend) {
        let disc = 0;
        if (rule.discount_type === "flat_amount") disc = rule.discount_value;
        else if (rule.discount_type === "percentage") disc = (subtotal * rule.discount_value) / 100;
        else if (rule.discount_type === "per_carton") disc = rule.discount_value * totalCartons;

        if (disc > bestDiscount) {
          bestDiscount = disc;
          ruleName = rule.name;
        }
      }
    }

    // 3. Check Promo Code
    if (appliedPromoCode) {
      const cleanCode = appliedPromoCode.trim().toUpperCase();
      const pRule = priceRules.find(
        (r) =>
          r.rule_type === "promo_code" &&
          (r.promo_code || "").trim().toUpperCase() === cleanCode &&
          r.is_active
      );

      if (!pRule) {
        promoError = `Promo code "${cleanCode}" is invalid or expired.`;
      } else {
        const isLimitReached =
          pRule.is_limit_reached ||
          (pRule.usage_limit !== undefined &&
            pRule.usage_limit !== null &&
            pRule.usage_limit > 0 &&
            Number(pRule.used_count || 0) >= pRule.usage_limit);

        if (isLimitReached) {
          promoError = `Promo code "${cleanCode}" has reached its maximum claims limit.`;
        } else if (pRule.min_cartons > 0 && totalCartons < pRule.min_cartons) {
          promoError = `Requires minimum ${pRule.min_cartons} cartons (you currently have ${totalCartons}).`;
        } else if (pRule.min_spend > 0 && subtotal < pRule.min_spend) {
          promoError = `Requires minimum $${pRule.min_spend.toFixed(2)} subtotal (current is $${subtotal.toFixed(2)}).`;
        } else {
          let disc = 0;
          let rateDesc = "";
          if (pRule.discount_type === "flat_amount") {
            disc = pRule.discount_value;
            rateDesc = `$${pRule.discount_value.toFixed(2)} off`;
          } else if (pRule.discount_type === "percentage") {
            disc = (subtotal * pRule.discount_value) / 100;
            rateDesc = `${pRule.discount_value}% off`;
          } else if (pRule.discount_type === "per_carton") {
            disc = pRule.discount_value * totalCartons;
            rateDesc = `$${pRule.discount_value.toFixed(2)}/ctn off`;
          }

          if (disc > 0) {
            bestDiscount = disc;
            ruleName = `Promo: ${pRule.promo_code}`;
            promoDesc = rateDesc;
          }
        }
      }
    }

    return {
      discountAmount: Number(bestDiscount.toFixed(2)),
      ruleName,
      promoError,
      promoDesc
    };
  }, [totalCartons, subtotal, priceRules, appliedPromoCode]);

  const deliveryFee = useMemo(() => {
    if (deliveryMethod === "pickup") return 0;
    const effectiveSubtotal = Math.max(0, subtotal - discountInfo.discountAmount);
    if (effectiveSubtotal >= Number(settings.free_delivery_threshold || 50)) {
      return 0;
    }
    return Number(settings.delivery_fee || 5.0);
  }, [deliveryMethod, subtotal, discountInfo.discountAmount, settings.free_delivery_threshold, settings.delivery_fee]);

  const totalAmount = useMemo(() => {
    const effectiveSubtotal = Math.max(0, subtotal - discountInfo.discountAmount);
    return Number((effectiveSubtotal + deliveryFee).toFixed(2));
  }, [subtotal, discountInfo.discountAmount, deliveryFee]);

  const canCheckout = totalCartons >= Number(settings.min_order_cartons || 2) && settings.is_store_open;

  // Add Standard Carton to Cart
  const handleAddStandardCarton = (product: Product) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.sku === product.sku);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx].carton_qty += 1;
        return next;
      } else {
        return [
          ...prev,
          {
            id: `cart_${Date.now()}_${Math.random()}`,
            carton_type: "standard",
            brand_id: product.brand_id,
            sku: product.sku,
            name: `${product.display_name} (${product.carton_pcs} pcs)`,
            carton_qty: 1,
            carton_price: product.carton_price,
            price_per_piece: product.price_per_piece
          }
        ];
      }
    });
  };

  const handleUpdateCartonQty = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === cartItemId) {
            const newQty = item.carton_qty + delta;
            return newQty > 0 ? { ...item, carton_qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartCarton[]
    );
  };

  // Groups of carton sizes for currently active mix brand
  const currentBrandCartonGroups = useMemo(() => {
    if (!mixBrand) return [];
    return getBrandCartonGroups(mixBrand, products);
  }, [mixBrand, products]);

  const activeCartonGroup = useMemo(() => {
    if (!currentBrandCartonGroups.length) return null;
    return (
      currentBrandCartonGroups.find((g) => g.key === selectedCartonGroupKey) ||
      currentBrandCartonGroups[0]
    );
  }, [currentBrandCartonGroups, selectedCartonGroupKey]);

  const activeTargetCartonSize = activeCartonGroup?.carton_pcs || mixBrand?.mix_carton_size || 24;

  // Open Mix Builder
  const handleOpenMixBuilder = (brand: Brand, existingItem?: CartCarton, presetGroupKey?: string) => {
    setMixBrand(brand);
    const groups = getBrandCartonGroups(brand, products);
    let targetGroupKey = presetGroupKey || "";

    if (existingItem) {
      targetGroupKey = existingItem.carton_group_key || "";
      const selections: Record<string, number> = {};
      if (existingItem.loose_bottles) {
        existingItem.loose_bottles.forEach((lb) => {
          selections[lb.sku] = lb.qty;
        });
      }
      setMixSelections(selections);
      setEditingCartItemId(existingItem.id);
    } else {
      setMixSelections({});
      setEditingCartItemId(null);
    }

    if (!targetGroupKey || !groups.some((g) => g.key === targetGroupKey)) {
      targetGroupKey = groups[0]?.key || "";
    }
    setSelectedCartonGroupKey(targetGroupKey);
    setMixBuilderOpen(true);
  };

  const currentMixTotalBottles = useMemo(() => {
    return Object.values(mixSelections).reduce((sum, q) => sum + q, 0);
  }, [mixSelections]);

  const handleSaveMixCarton = () => {
    if (!mixBrand || !activeCartonGroup) return;
    const targetSize = activeTargetCartonSize;
    if (currentMixTotalBottles !== targetSize) return;

    // Safety guard: ensure user selects at least 2 distinct items and max (targetSize - 1) per SKU
    const maxPerSku = Math.max(1, targetSize - 1);
    const hasSingleSkuOnly = Object.values(mixSelections).some((q) => q > maxPerSku);
    const distinctCount = Object.values(mixSelections).filter((q) => q > 0).length;
    if (hasSingleSkuOnly || distinctCount < 2) return;

    // Build loose bottles recipe
    const looseBottles: LooseBottlePick[] = [];
    let cartonPrice = 0;

    Object.entries(mixSelections).forEach(([sku, qty]) => {
      if (qty > 0) {
        const p = products.find((prod) => prod.sku === sku);
        const ppp = p?.price_per_piece || 2.0;
        looseBottles.push({
          sku,
          flavor: p?.display_name || sku,
          qty,
          price_per_piece: ppp
        });
        cartonPrice += ppp * qty;
      }
    });

    const cartonName = `${mixBrand.display_name} Custom Mix Carton (${targetSize} pcs)`;

    if (editingCartItemId) {
      setCart((prev) =>
        prev.map((it) =>
          it.id === editingCartItemId
            ? {
                ...it,
                name: cartonName,
                carton_price: Number(cartonPrice.toFixed(2)),
                loose_bottles: looseBottles,
                carton_group_key: activeCartonGroup.key,
                dimensions_text: activeCartonGroup.dimensions_text,
                carton_pcs: targetSize
              }
            : it
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: `mix_${Date.now()}_${Math.random()}`,
          carton_type: "custom_mix",
          brand_id: mixBrand.id,
          name: cartonName,
          carton_qty: 1,
          carton_price: Number(cartonPrice.toFixed(2)),
          loose_bottles: looseBottles,
          carton_group_key: activeCartonGroup.key,
          dimensions_text: activeCartonGroup.dimensions_text,
          carton_pcs: targetSize
        }
      ]);
    }

    setMixBuilderOpen(false);
    setMixSelections({});
    setEditingCartItemId(null);
  };

  // Submit Order Initiation & SGQR Generation
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCheckoutFormValid) return;
    const isPickup = deliveryMethod === "pickup";

    setIsSubmittingOrder(true);
    try {
      const orderPayload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        delivery_method: deliveryMethod,
        delivery_address: isPickup
          ? `Self-Pickup: ${settings.warehouse_address || "9 Eunos Ave 8A, EUNOS INDUSTRIAL ESTATE, Singapore 409461"}`
          : deliveryAddress,
        postal_code: isPickup ? "409461" : postalCode,
        unit_no: isPickup ? "Warehouse Self-Pickup" : unitNo,
        delivery_notes: deliveryNotes,
        items: cart,
        total_cartons: totalCartons,
        subtotal,
        discount_amount: discountInfo.discountAmount,
        applied_discount_rule: discountInfo.ruleName,
        delivery_fee: deliveryFee
      };

      const res = await fetch(`${WORKER_URL}/api/shop/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create order");
      }

      const data = await res.json();
      if (data.success) {
        const expiresAt = Date.now() + 5 * 60 * 1000;
        setCreatedOrder(data.order);
        setSgqrPayload(data.sgqr_payload);
        setPaymentExpiresAt(expiresAt);
        setTimeLeftSeconds(300);
        try {
          localStorage.setItem("hsg_pending_order", JSON.stringify(data.order));
          localStorage.setItem("hsg_pending_sgqr", data.sgqr_payload);
          localStorage.setItem("hsg_payment_expires_at", String(expiresAt));
        } catch (e) {
          console.warn("Could not cache payment session", e);
        }
        setCheckoutModalOpen(false);
        setPaymentModalOpen(true);
        setPaymentConfirmedTick(false);
      }
    } catch (err: any) {
      alert(err.message || "Could not proceed to payment");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const clearPaymentSession = () => {
    try {
      localStorage.removeItem("hsg_payment_expires_at");
      localStorage.removeItem("hsg_pending_order");
      localStorage.removeItem("hsg_pending_sgqr");
    } catch {}
    setPaymentExpiresAt(0);
    setCreatedOrder(null);
    setSgqrPayload("");
    setTimeLeftSeconds(300);
  };

  // Countdown Timer Ticker for 5-Minute Session
  useEffect(() => {
    if (!paymentModalOpen || !paymentExpiresAt) return;

    const checkTimer = () => {
      const diff = Math.max(0, Math.floor((paymentExpiresAt - Date.now()) / 1000));
      setTimeLeftSeconds(diff);
      if (diff <= 0) {
        handleExpirePayment();
      }
    };

    checkTimer();
    const interval = setInterval(checkTimer, 1000);
    return () => clearInterval(interval);
  }, [paymentModalOpen, paymentExpiresAt]);

  // Cancel & Back to Details Action
  const handleCancelPayment = async () => {
    const orderToCancel = createdOrder?.order_ref;
    clearPaymentSession();
    setPaymentModalOpen(false);
    setCheckoutModalOpen(true);
    if (orderToCancel) {
      try {
        await fetch(`${WORKER_URL}/api/shop/orders?ref=${encodeURIComponent(orderToCancel)}`, {
          method: "DELETE"
        });
      } catch (e) {
        console.warn("Failed to delete order on cancel", e);
      }
    }
  };

  // Auto-Expire Action on 00:00 (No mention of draft)
  const handleExpirePayment = async () => {
    const orderToCancel = createdOrder?.order_ref;
    clearPaymentSession();
    setPaymentModalOpen(false);
    setCheckoutModalOpen(true);
    setExpireToast(true);
    setTimeout(() => setExpireToast(false), 5000);
    if (orderToCancel) {
      try {
        await fetch(`${WORKER_URL}/api/shop/orders?ref=${encodeURIComponent(orderToCancel)}`, {
          method: "DELETE"
        });
      } catch (e) {
        console.warn("Failed to delete order on expire", e);
      }
    }
  };

  // User clicked "I have already paid" -> Transition directly to Thank You / Order Confirmation page
  const handleAlreadyPaid = () => {
    if (!createdOrder) return;

    // Clear cart and payment timer session
    setCart([]);
    setAppliedPromoCode("");
    clearPaymentSession();

    // Set tracked order to current order and close payment modal
    setTrackedOrder(createdOrder);
    setTrackingOrderRef(createdOrder.order_ref);
    setPaymentModalOpen(false);

    // Update browser URL query to ?track=HSG-XXXX for clean bookmarking/refreshing
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("track", createdOrder.order_ref);
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      // ignore
    }

    // Refresh live order state from backend
    loadTrackedOrder(createdOrder.order_ref);
  };

  // Save / Download QR Code Canvas as PNG (Image 2 style)
  const handleDownloadQR = () => {
    try {
      const canvas = document.getElementById("sgqr-canvas") as HTMLCanvasElement | null;
      if (!canvas) return;
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.download = `PayNow_QR_${createdOrder?.order_ref || "order"}.png`;
      a.href = url;
      a.click();
      setDownloadSuccessToast(true);
      setTimeout(() => setDownloadSuccessToast(false), 3000);
    } catch (e) {
      console.warn("Could not download QR canvas", e);
    }
  };


  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-zinc-900 font-primary">
      {/* ========================================================= */}
      {/* TOP ANNOUNCEMENT BAR & GLOBAL NAVBAR                      */}
      {/* ========================================================= */}
      {!trackedOrder && (
        <>
          <div
            className={`px-4 py-2 text-center text-xs font-bold transition-all ${
              !settings.is_store_open
                ? "bg-rose-600 text-white"
                : "bg-[#041E49] text-[#D3E3FD]"
            }`}
          >
            {!settings.is_store_open ? (
              <div className="flex items-center justify-center gap-2">
                <AlertCircle size={14} />
                <span>{settings.pause_notice_message}</span>
              </div>
            ) : (
              <>
                {/* Desktop: Static Full Announcement */}
                <div className="hidden sm:flex items-center justify-center gap-2">
                  <Truck size={14} className="text-[#D3E3FD]" />
                  <span>
                    Islandwide Singapore Delivery • Free delivery on orders over ${settings.free_delivery_threshold} SGD
                  </span>
                </div>

                {/* Mobile: Sliding Announcement Carousel */}
                <div className="sm:hidden relative h-5 overflow-hidden flex items-center justify-center">
                  {announcementSlides.map((slide, idx) => (
                    <div
                      key={idx}
                      className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-all duration-500 ease-in-out ${
                        idx === announcementIndex
                          ? "opacity-100 translate-y-0"
                          : "opacity-0 translate-y-2 pointer-events-none"
                      }`}
                    >
                      {slide.icon}
                      <span className="truncate text-xs font-bold tracking-tight">
                        {slide.text}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
              {/* Brand Logo & Name */}
              <div
                onClick={() => {
                  setTrackedOrder(null);
                  setTrackingOrderRef("");
                }}
                className="flex items-center gap-3 cursor-pointer select-none"
              >
                <img
                  src="/icon.png"
                  alt="HSG Global"
                  className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div>
                  <div className="font-extrabold text-base tracking-tight text-zinc-950 flex items-center gap-1.5">
                    HSG GLOBAL
                    <span className="text-[10px] bg-[#D3E3FD] text-[#041E49] px-1.5 py-0.5 rounded font-mono font-bold">
                      SHOP
                    </span>
                  </div>
                  <p className="hidden sm:block text-[11px] text-zinc-500 font-medium">Official HSG Global Wholesale</p>
                </div>
              </div>

              {/* Cart Floating Pill Header Link (Hidden when cart is empty) */}
              {cart.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCartDrawerOpen(true)}
                    className="h-10 px-3.5 rounded-xl flex items-center gap-2.5 transition-colors select-none bg-slate-100 hover:bg-slate-200/80 cursor-pointer text-zinc-900"
                    title="View Cart"
                  >
                    <div className="relative">
                      <ShoppingCart size={18} className="text-zinc-800" />
                      {totalCartons > 0 && (
                        <span className="absolute -top-2 -right-2 bg-[#0B57D0] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                          {totalCartons}
                        </span>
                      )}
                    </div>
                    {totalCartons > 0 && (
                      <div className="text-xs font-extrabold text-zinc-950 hidden sm:block">
                        ${subtotal.toFixed(2)}
                      </div>
                    )}
                  </button>
                </div>
              )}
            </div>
          </header>
        </>
      )}

      {/* ========================================================= */}
      {/* TRACKING SCREEN VIEW (IF ACTIVE)                          */}
      {/* ========================================================= */}
      {trackedOrder ? (() => {
        const isVerified = trackedOrder.payment_status === "verified";
        const isPickup = trackedOrder.delivery_address?.toLowerCase().includes("self-pickup");
        const trackingUrl = `${window.location.origin}/?track=${trackedOrder.order_ref}`;

        const waMessage = `*Order ID: ${trackedOrder.order_ref}*
Hi HSG Global, here is my order details.
Track Order: ${trackingUrl}

Amount: SGD $${Number(trackedOrder.total_amount).toFixed(2)}
Cartons: ${trackedOrder.total_cartons} CTN
Customer: ${trackedOrder.customer_name} (${trackedOrder.customer_phone})

Here is the screenshot of my PayNow transfer.
Thank you!`;

        const targetWhatsApp = settings.whatsapp_number.replace(/[^0-9]/g, "") || "6582345678";
        const waUrl = `https://wa.me/${targetWhatsApp}?text=${encodeURIComponent(waMessage)}`;

        const handleBackToStore = () => {
          setTrackedOrder(null);
          setTrackingOrderRef("");
          try {
            const u = new URL(window.location.href);
            u.searchParams.delete("track");
            u.searchParams.delete("ref");
            window.history.replaceState(null, "", u.toString());
          } catch (e) {
            // ignore
          }
        };

        return (
          <div className="flex-1 flex flex-col min-h-screen bg-[#F8F9FA] font-primary">
            {/* Top Header */}
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs">
              <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center text-center">
                <button
                  type="button"
                  onClick={handleBackToStore}
                  className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer shadow-xs select-none shrink-0 mb-2"
                >
                  <ArrowLeft size={14} className="text-zinc-600 shrink-0" />
                  <span>Back to Storefront</span>
                </button>

                <h3 className="text-base font-extrabold text-zinc-950">Order Confirmation</h3>
                <p className="text-[11px] text-zinc-500">
                  Order <span className="font-mono font-bold text-zinc-700">{trackedOrder.order_ref}</span> • Live Order Confirmation & Tracking
                </p>
              </div>
            </div>

            {/* Main Body: 2 Columns on Desktop */}
            <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* LEFT COLUMN (7 cols): Thank you greeting, Live verification status, WhatsApp handoff, Tracking link, Lifecycle */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* 1. Thank You Hero Header */}
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-2xs">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Order Confirmation</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-zinc-950 tracking-tight">
                    Thank you for your order!
                  </h1>
                  <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                    Your order <strong className="font-mono text-zinc-900">{trackedOrder.order_ref}</strong> has been received. Please send your payment screenshot on WhatsApp so our operators can verify and process your shipment.
                  </p>
                </div>

                {/* 2. Send Order to WhatsApp Card (Button + Desktop-only QR Code) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-sm text-zinc-900">
                      <MessageSquare size={16} className="text-[#25D366]" />
                      <span>Send Order to WhatsApp</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                      Click the button below to message our customer care team on WhatsApp with your pre-filled receipt details:
                    </p>
                  </div>

                  {/* Send Button */}
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-12 bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-sm rounded-full flex items-center justify-center gap-2 transition-transform active:scale-98 shadow-sm cursor-pointer"
                  >
                    <Phone size={16} />
                    <span>Send Order to WhatsApp</span>
                  </a>

                  {/* Desktop / Window Only QR Code */}
                  <div className="hidden md:flex flex-col items-center justify-center pt-4 border-t border-slate-100 text-center">
                    <span className="text-[11px] font-semibold text-zinc-600 mb-3">
                      On a computer? Scan with your phone's camera to open WhatsApp directly:
                    </span>
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                      <QRCodeCanvas
                        value={waUrl}
                        size={160}
                        level="M"
                        fgColor="#0F172A"
                        bgColor="#FFFFFF"
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400 mt-2">
                      Scan with phone camera • Instantly launches WhatsApp with pre-filled order receipt
                    </span>
                  </div>
                </div>

                {/* 4. Tracking Link & Copy Button */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-zinc-800">Order Tracking Link</div>
                    <span className="text-[10px] font-medium text-zinc-500">Bookmark or save</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Save this direct link to check real-time fulfillment status and delivery updates anytime.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={trackingUrl}
                      className="flex-1 h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-mono text-zinc-700 select-all focus:outline-none focus:ring-1 focus:ring-[#0B57D0]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(trackingUrl);
                        setCopiedToastText("Tracking link");
                        setTimeout(() => setCopiedToastText(""), 2500);
                      }}
                      className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-100 text-zinc-800 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs active:scale-95"
                    >
                      <Copy size={13} />
                      <span>Copy Link</span>
                    </button>
                  </div>
                </div>

                {/* 5. Stepper Timeline */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="text-xs font-bold text-zinc-900 border-b border-slate-100 pb-2">
                    Fulfillment Milestones
                  </div>

                  <div className="space-y-4">
                    {/* Milestone 1 */}
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <Check size={14} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">Order Placed</div>
                        <div className="text-[11px] text-zinc-500">Order {trackedOrder.order_ref} recorded in system</div>
                      </div>
                    </div>

                    {/* Milestone 2 */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isVerified ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {isVerified ? <Check size={14} /> : <Clock size={14} />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">Payment Verification</div>
                        <div className="text-[11px] text-zinc-500">
                          {isVerified
                            ? "Payment verified by HSG Global operator"
                            : "Awaiting PayNow statement confirmation"}
                        </div>
                      </div>
                    </div>

                    {/* Milestone 3 */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          trackedOrder.fulfillment_status === "in_progress" ||
                          trackedOrder.fulfillment_status === "packing" ||
                          trackedOrder.fulfillment_status === "out_for_delivery" ||
                          trackedOrder.fulfillment_status === "completed"
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        <Package size={14} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">Warehouse Preparation</div>
                        <div className="text-[11px] text-zinc-500">Cartons bundled and prepared for release</div>
                      </div>
                    </div>

                    {/* Milestone 4 */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          trackedOrder.fulfillment_status === "completed"
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {isPickup ? <Building2 size={14} /> : <Truck size={14} />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">
                          {isPickup ? "Warehouse Self-Pickup Collection" : "Doorstep Delivery Handover"}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {trackedOrder.fulfillment_status === "completed"
                            ? "Order completed and handed over"
                            : isPickup
                            ? "Awaiting collection at Eunos warehouse"
                            : "Islandwide delivery to your address"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN (5 cols, sticky top): Order Summary Card */}
              <div className="lg:col-span-5 sticky top-24 space-y-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-zinc-900 text-sm">Order Summary</h3>
                    <span className="font-mono text-xs font-bold text-zinc-500">
                      {trackedOrder.order_ref}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-baseline">
                      <span className="text-zinc-600 font-medium">Total Payable:</span>
                      <span className="text-2xl font-black text-zinc-950">
                        SGD ${Number(trackedOrder.total_amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>Total Cartons:</span>
                      <span className="font-bold text-zinc-900">{trackedOrder.total_cartons} Cartons</span>
                    </div>
                  </div>

                  {/* Live Payment Status Indicator */}
                  {isVerified ? (
                    <div className="bg-emerald-50 border border-emerald-200/90 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                          <Check size={16} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                            Payment Received
                            <span className="text-[10px] font-normal bg-emerald-200/60 text-emerald-900 px-1.5 py-0.5 rounded font-mono">
                              Verified
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-800 mt-0.5">
                            Your PayNow transfer has been confirmed by our operator. Order is in fulfillment!
                          </div>
                        </div>
                      </div>
                      {trackedOrder.payment_verified_at && (
                        <span className="text-[10px] font-mono text-emerald-700 shrink-0">
                          {new Date(trackedOrder.payment_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 animate-pulse">
                          <Clock size={16} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                            Verify Payment
                            <span className="text-[10px] font-normal bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded font-mono">
                              Pending Review
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-800 mt-0.5">
                            Awaiting PayNow statement confirmation. Please send your payment screenshot on WhatsApp below.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadTrackedOrder(trackedOrder.order_ref)}
                        className="shrink-0 p-1.5 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                        title="Check verification status"
                      >
                        <RefreshCw size={14} className={trackingLoading ? "animate-spin" : ""} />
                      </button>
                    </div>
                  )}

                  {/* Fulfillment details */}
                  {isPickup ? (
                    <div className="bg-blue-50/70 rounded-xl p-3.5 border border-blue-200/80 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-[#0B57D0]">
                        <Building2 size={14} />
                        <span>Fulfillment: Warehouse Self-Pickup</span>
                      </div>
                      <div className="text-zinc-900 font-semibold">{trackedOrder.customer_name} ({trackedOrder.customer_phone})</div>
                      <div className="text-zinc-700 text-[11px] leading-relaxed">
                        {settings.warehouse_address || "9 Eunos Ave 8A, EUNOS INDUSTRIAL ESTATE, Singapore 409461"}
                      </div>
                      <div className="text-zinc-500 text-[10px] pt-1 border-t border-blue-200/60">
                        Hours: {settings.pickup_hours || "Mon - Fri: 10am - 6pm"}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-zinc-800">
                        <Truck size={14} className="text-[#0B57D0]" />
                        <span>Fulfillment: Doorstep Delivery</span>
                      </div>
                      <div className="text-zinc-900 font-semibold">{trackedOrder.customer_name} ({trackedOrder.customer_phone})</div>
                      <div className="text-zinc-700 text-[11px]">
                        {trackedOrder.delivery_address} {trackedOrder.unit_no ? `, ${trackedOrder.unit_no}` : ""}
                      </div>
                      <div className="text-zinc-500 text-[11px] font-mono">Singapore {trackedOrder.postal_code}</div>
                    </div>
                  )}

                  {/* Carton items breakdown */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Carton Items ({trackedOrder.items?.length || 0})
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {trackedOrder.items?.map((it: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 rounded-lg p-2.5 text-xs border border-slate-100">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className="font-semibold text-zinc-900 truncate" title={it.name}>
                              {it.name}
                            </span>
                            <span className="font-bold text-zinc-900 shrink-0 whitespace-nowrap">
                              {it.carton_qty} CTN
                            </span>
                          </div>
                          {it.loose_bottles && it.loose_bottles.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 text-[11px] text-zinc-600 space-y-0.5">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase">Mix Flavors:</span>
                              {it.loose_bottles.map((lb: any, lbIdx: number) => (
                                <div key={lbIdx} className="flex items-center justify-between gap-2 min-w-0 text-zinc-600">
                                  <span className="truncate" title={lb.flavor}>{lb.flavor}</span>
                                  <span className="font-medium shrink-0 whitespace-nowrap">{lb.qty} pcs</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Return button */}
                  <button
                    type="button"
                    onClick={handleBackToStore}
                    className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-zinc-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Back to Storefront</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>

            </div>
          </main>
        </div>
      );
      })() : (
        /* ========================================================= */
        /* MAIN STOREFRONT VIEW                                      */
        /* ========================================================= */
        <>
          {/* ========================================================= */}
          {/* HERO SLIDER (FULL WIDTH, NO ROUND CORNERS, MAX 270PX)     */}
          {/* ========================================================= */}
          {settings.show_hero_section !== false && (
            <section className="w-full h-[200px] sm:h-[235px] md:h-[270px] max-h-[270px] relative overflow-hidden bg-zinc-950 text-white rounded-none select-none shrink-0">
              {slides.map((slide, idx) => {
                const isActive = idx === currentSlideIndex;
                return (
                  <div
                    key={slide.id || idx}
                    className={`absolute inset-0 transition-opacity duration-700 ease-in-out flex items-center ${
                      isActive ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none"
                    }`}
                  >
                    {slide.bg_image ? (
                      <div className="absolute inset-0">
                        <img src={slide.bg_image} alt={slide.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/35" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />
                    )}

                    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 relative z-10">
                      <div className="max-w-xl">
                        {slide.badge_text && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-amber-300 text-[11px] font-bold mb-1.5 sm:mb-2 backdrop-blur-xs">
                            <Sparkles size={12} />
                            {slide.badge_text}
                          </div>
                        )}
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight leading-tight line-clamp-2">
                          {slide.title}
                        </h1>
                        <p className="text-zinc-300 text-xs sm:text-sm mt-1 sm:mt-1.5 leading-snug line-clamp-2">
                          {slide.subtitle}
                        </p>

                        {slide.tags && slide.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-2.5 text-xs text-zinc-300 font-semibold">
                            {slide.tags.map((tag, tIdx) => (
                              <div key={tIdx} className="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded-md text-[11px]">
                                <CheckCircle2 size={12} className="text-emerald-400" />
                                {tag}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {slides.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentSlideIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1))}
                    aria-label="Previous slide"
                    className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs transition-all z-20 cursor-pointer shadow-md"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setCurrentSlideIndex((prev) => (prev + 1) % slides.length)}
                    aria-label="Next slide"
                    className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs transition-all z-20 cursor-pointer shadow-md"
                  >
                    <ChevronRight size={18} />
                  </button>

                  <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
                    {slides.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentSlideIndex(i)}
                        aria-label={`Go to slide ${i + 1}`}
                        className={`h-1.5 transition-all rounded-full cursor-pointer ${
                          i === currentSlideIndex ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 sm:py-6">
            {/* 1. Category Filter Tabs (Scrollable on mobile, only shown if more than 1 category exists) */}
            {categories.length > 1 && (
              <div className="mb-2.5">
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar scroll-smooth">
                  {categories.map((cat) => {
                    const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                    return (
                      <button
                        key={cat}
                        onClick={() => handleSelectCategory(cat)}
                        className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                          isSelected
                            ? "bg-[#0B57D0] text-white shadow-xs"
                            : "bg-white text-zinc-700 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Brand Filter Pills (Sub-Tier Under Category, Scrollable on mobile) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar scroll-smooth">
              <button
                onClick={() => setSelectedBrandId("all")}
                className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center shrink-0 ${
                  selectedBrandId === "all"
                    ? "bg-zinc-950 text-white shadow-xs"
                    : "bg-white text-zinc-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                All Brands
              </button>
              {visibleBrands.map((brand) => {
                const isSelected = selectedBrandId === brand.id;
                return (
                  <button
                    key={brand.id}
                    onClick={() => setSelectedBrandId(brand.id)}
                    className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                      isSelected
                        ? "bg-zinc-950 text-white shadow-xs"
                        : "bg-white text-zinc-700 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {brand.logo_image && (
                      <img src={brand.logo_image} alt={brand.display_name} className="w-3.5 h-3.5 object-contain" />
                    )}
                    {brand.display_name}
                  </button>
                );
              })}
            </div>

            {/* ========================================================= */}
            {/* FEATURED: CUSTOM MIX CARTON HERO BUILDER                  */}
            {/* ========================================================= */}
            {(() => {
              // Only display Custom Mix banner on specific brand tabs (omitted on "All Brands" tab)
              if (selectedBrandId === "all") return null;

              const currentBrand = combinedBrands.find((b) => b.id === selectedBrandId && b.allow_custom_mix);
              if (!currentBrand) return null;

              const brandCartonGroups = getBrandCartonGroups(currentBrand, products);
              if (brandCartonGroups.length === 0) return null;

              return (
                <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-5 sm:p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-extrabold text-zinc-950">
                      Build Your {currentBrand.display_name} Custom Mix Carton
                    </h3>
                    <p className="text-xs text-zinc-600 mt-1 max-w-xl">
                      Pick and mix your favorite items into a custom carton.
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenMixBuilder(currentBrand)}
                    className="h-10 px-5 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 shrink-0 transition-transform active:scale-95 cursor-pointer shadow-sm"
                  >
                    <Package size={14} className="text-amber-400" />
                    <span>Build Custom Mix Carton ➔</span>
                  </button>
                </div>
              );
            })()}

          {/* ========================================================= */}
          {/* PRODUCT CARDS GRID                                        */}
          {/* ========================================================= */}
          <div className="mb-10">
            {displayedProducts.length > 0 && (
              <div className="text-xs text-zinc-500 font-medium mb-3">
                {displayedProducts.length} items available
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 h-64 animate-pulse" />
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-zinc-500">
                No products currently listed for this category / brand selection.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {displayedProducts.map((product) => {
                  const isOutOfStock = product.status === "out_of_stock";
                  const inCartItem = cart.find((it) => it.sku === product.sku);

                  return (
                    <div
                      key={product.sku}
                      className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col"
                    >
                      {/* Product Image Box */}
                      <div className="relative aspect-square bg-[#F8F9FA] overflow-hidden flex items-center justify-center">
                        {product.badge_text && (() => {
                          const safeId = String(product.sku).replace(/[^a-zA-Z0-9_-]/g, "_");
                          const fontSize = product.badge_text.length > 18 ? 3.4 : product.badge_text.length > 13 ? 3.9 : 4.4;
                          return (
                            <div className="absolute inset-0 pointer-events-none select-none z-10">
                              {/* Frosted blur backdrop clipped to matching ribbon polygon */}
                              <div
                                className="absolute inset-0 backdrop-blur-2xs"
                                style={{
                                  clipPath: "polygon(-2% 34%, 50% 31%, 102% 16%, 102% 37%, 50% 42%, -2% 52%)"
                                }}
                              />
                              <svg
                                className="absolute inset-0 w-full h-full"
                                viewBox="0 0 100 100"
                              >
                                <defs>
                                  <filter id={`ribbon-shadow-${safeId}`} x="-10%" y="-10%" width="120%" height="130%">
                                    <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.35" />
                                  </filter>
                                  {/* Center guide curve for the text */}
                                  <path
                                    id={`ribbon-text-path-${safeId}`}
                                    d="M -2 43 Q 50 36.5 102 26.5"
                                    fill="none"
                                  />
                                </defs>

                                {/* Ribbon Body (semi-transparent red ribbon, no outline, right side tilted up) */}
                                <path
                                  d="M -2 34 Q 50 31 102 16 L 102 37 Q 50 42 -2 52 Z"
                                  fill="rgba(220, 38, 38, 0.78)"
                                  stroke="none"
                                  filter={`url(#ribbon-shadow-${safeId})`}
                                />

                                {/* White uppercase text aligned along the ribbon's curve */}
                                <text
                                  fill="#ffffff"
                                  fontSize={fontSize}
                                  fontWeight="900"
                                  letterSpacing="0.08em"
                                  style={{ textTransform: "uppercase" }}
                                  filter="drop-shadow(0 1px 1.5px rgba(0,0,0,0.85))"
                                >
                                  <textPath
                                    href={`#ribbon-text-path-${safeId}`}
                                    startOffset="50%"
                                    textAnchor="middle"
                                  >
                                    {product.badge_text}
                                  </textPath>
                                </text>
                              </svg>
                            </div>
                          );
                        })()}
                        <img
                          src={product.image}
                          alt={product.display_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>

                      {/* Product Info */}
                      <div className="p-3.5 flex flex-col flex-1 justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-xs text-zinc-900 line-clamp-2 leading-tight">
                            {product.display_name}
                          </h3>
                          <div className="text-[11px] text-zinc-500 mt-1 font-medium">
                            <span>{product.carton_pcs} pcs / ctn</span>
                          </div>
                        </div>

                        {/* Pricing & Add to Cart */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div>
                            {product.slash_price && product.normal_carton_price && product.slash_price < product.normal_carton_price ? (
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-red-600">
                                    ${product.carton_price.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 line-through">
                                    ${product.normal_carton_price.toFixed(2)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                  ${product.price_per_piece.toFixed(2)} / pc
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="text-xs font-bold text-zinc-950">
                                  ${product.carton_price.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                  ${product.price_per_piece.toFixed(2)} / pc
                                </div>
                              </div>
                            )}
                          </div>

                          {isOutOfStock ? (
                            <button
                              disabled
                              className="h-8 px-3 bg-slate-100 text-slate-400 text-xs font-bold rounded-lg cursor-not-allowed"
                            >
                              Sold Out
                            </button>
                          ) : inCartItem ? (
                            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
                              <button
                                onClick={() => handleUpdateCartonQty(inCartItem.id, -1)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-white text-zinc-800 hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="text-xs font-bold text-zinc-900 px-1">{inCartItem.carton_qty}</span>
                              <button
                                onClick={() => handleUpdateCartonQty(inCartItem.id, 1)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-white text-zinc-800 hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleAddStandardCarton(product)}
                              className="h-8 px-3 bg-[#0B57D0] hover:bg-[#0842A0] text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus size={13} /> Add
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </>
    )}

      {/* ========================================================= */}
      {/* PERSISTENT BOTTOM FLOATING CART BAR                       */}
      {/* ========================================================= */}
      {totalCartons > 0 && !trackedOrder && !cartDrawerOpen && !checkoutModalOpen && !paymentModalOpen && (
        <div className="fixed bottom-5 inset-x-4 max-w-md mx-auto z-40 animate-in slide-in-from-bottom duration-200">
          <div className="bg-white/95 backdrop-blur-md text-zinc-900 px-3.5 py-2.5 rounded-full shadow-lg border border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 pl-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-zinc-700 shrink-0">
                <ShoppingCart size={15} />
              </div>
              <div className="text-xs truncate">
                <div className="font-extrabold text-zinc-950 flex items-center gap-1.5 truncate">
                  <span>{totalCartons} Cartons</span>
                  <span className="text-zinc-300">•</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {totalCartons < Number(settings.min_order_cartons || 2) && (
                  <div className="text-[10px] text-amber-600 font-medium truncate">
                    Min. {settings.min_order_cartons || 2} cartons
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setCartDrawerOpen(true)}
              className="h-9 px-4 bg-[#0B57D0] hover:bg-[#0842A0] text-white font-bold text-xs rounded-full flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-xs shrink-0"
            >
              <span>View Cart</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FULL-PAGE VIEW: SHOPPING CART & PROMO CODE                */}
      {/* ========================================================= */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto flex flex-col">
          {/* Sticky Top Header */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs">
            <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center text-center">
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer shadow-xs select-none shrink-0 mb-2"
              >
                <ArrowLeft size={14} className="text-zinc-600 shrink-0" />
                <span>Continue Shopping</span>
              </button>

              <h3 className="text-base font-extrabold text-zinc-950">Shopping Cart</h3>
              <p className="text-[11px] text-zinc-500">
                {totalCartons} {totalCartons === 1 ? "Carton" : "Cartons"} in your order
              </p>
            </div>
          </div>

          {/* Cart Body (2 Columns on Desktop) */}
          <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8 text-xs">
            {cart.length === 0 ? (
              <div className="max-w-md mx-auto text-center py-16 space-y-3">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-zinc-400">
                  <ShoppingCart size={24} />
                </div>
                <div className="font-bold text-sm text-zinc-800">Your shopping cart is empty</div>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Explore our wholesale carton collection and add items to begin your order.
                </p>
                <button
                  type="button"
                  onClick={() => setCartDrawerOpen(false)}
                  className="h-9 px-4 bg-[#0B57D0] hover:bg-[#0842A0] text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer mt-2"
                >
                  <ArrowLeft size={14} />
                  <span>Browse Products</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                {/* Left Column: Cart Items & Promo Code */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Order Items ({cart.length})
                  </div>

                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-bold text-sm text-zinc-900">{item.name}</div>
                            <div className="text-xs text-zinc-500 font-medium mt-0.5">
                              ${item.carton_price.toFixed(2)} per carton
                            </div>
                          </div>
                          <div className="font-extrabold text-sm text-zinc-950">
                            ${(item.carton_price * item.carton_qty).toFixed(2)}
                          </div>
                        </div>

                        {/* Loose bottles recipe if custom mix */}
                        {item.loose_bottles && item.loose_bottles.length > 0 && (
                          <div className="text-[11px] text-zinc-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                            <div className="font-semibold text-zinc-700 mb-1.5">Custom Recipe Breakdown:</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {item.loose_bottles.map((lb, i) => (
                                <div key={i} className="flex justify-between text-zinc-600 pr-2">
                                <span>• {lb.flavor}</span>
                                <span className="font-bold text-zinc-800">{lb.qty} pcs</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        {item.carton_type === "custom_mix" ? (
                          <button
                            type="button"
                            onClick={() => {
                              const b = combinedBrands.find((br) => (br.brand_ids || [br.id]).includes(item.brand_id));
                              if (b) {
                                setCartDrawerOpen(false);
                                handleOpenMixBuilder(b, item);
                              }
                            }}
                            className="text-xs text-[#0B57D0] hover:text-[#0842A0] hover:underline font-semibold cursor-pointer"
                          >
                            Edit Recipe
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUpdateCartonQty(item.id, -item.carton_qty)}
                            className="text-[11px] text-zinc-400 hover:text-rose-600 flex items-center gap-1 font-medium cursor-pointer transition-colors"
                          >
                            <Trash2 size={13} />
                            <span>Remove</span>
                          </button>
                        )}

                        <div className="flex items-center gap-2.5 ml-auto">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartonQty(item.id, -1)}
                            className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-zinc-700 hover:bg-slate-200 cursor-pointer active:scale-95 transition-all"
                            title="Decrease quantity"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-xs font-extrabold text-zinc-950 w-6 text-center">
                            {item.carton_qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartonQty(item.id, 1)}
                            className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-zinc-700 hover:bg-slate-200 cursor-pointer active:scale-95 transition-all"
                            title="Increase quantity"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Sticky Summary & Checkout Button */}
              <div className="lg:col-span-5 sticky top-24 space-y-4">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3 shadow-2xs">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider pb-1 border-b border-slate-200">
                    Pricing Summary
                  </div>

                  <div className="flex justify-between text-zinc-600 pt-1">
                    <span>Subtotal ({totalCartons} Cartons):</span>
                    <span className="font-semibold text-zinc-900">${subtotal.toFixed(2)}</span>
                  </div>

                  {discountInfo.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Discount ({discountInfo.ruleName}):</span>
                      <span>-${discountInfo.discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery Fee:</span>
                    <span className={deliveryFee === 0 ? "text-emerald-600 font-bold" : "text-zinc-900 font-semibold"}>
                      {deliveryFee === 0 ? "FREE" : `$${deliveryFee.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="flex justify-between text-base font-extrabold text-zinc-950 pt-2 border-t border-slate-200">
                    <span>Total Payable:</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>

                  {/* Promo Code Input */}
                  <div className="pt-2 border-t border-slate-200">
                    {!showPromoInput && !appliedPromoCode ? (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs font-bold text-zinc-800">Have a Promo Code?</span>
                        <button
                          type="button"
                          onClick={() => setShowPromoInput(true)}
                          className="h-7 px-3 bg-slate-100 hover:bg-slate-200 text-[#0B57D0] hover:text-[#0842A0] rounded-full text-xs font-bold transition-colors cursor-pointer border border-slate-200"
                        >
                          Yes
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-xs font-bold text-zinc-800">Have a Promo Code?</div>
                          {!appliedPromoCode && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowPromoInput(false);
                                setPromoCodeInput("");
                              }}
                              className="text-[10px] text-zinc-400 hover:text-zinc-600 underline cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="EG : HSGGLOBAL"
                            value={promoCodeInput}
                            onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                            className="flex-1 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-[#0B57D0]"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedPromoCode(promoCodeInput.trim());
                            }}
                            className="px-4 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                        {appliedPromoCode && (
                          <div className="mt-2 space-y-1">
                            {discountInfo.promoError ? (
                              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5">
                                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                                  <span>{discountInfo.promoError}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAppliedPromoCode("");
                                    setPromoCodeInput("");
                                    setShowPromoInput(false);
                                  }}
                                  className="text-[10px] text-zinc-500 hover:text-zinc-800 underline shrink-0 cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : (
                              <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                  <span>
                                    Applied <strong>{appliedPromoCode}</strong>
                                    {discountInfo.promoDesc ? ` (${discountInfo.promoDesc})` : ""}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAppliedPromoCode("");
                                    setPromoCodeInput("");
                                    setShowPromoInput(false);
                                  }}
                                  className="text-[10px] text-red-500 hover:text-red-700 underline cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Minimum Cartons Checker / Proceed Button */}
                  <div className="pt-2">
                    {!canCheckout ? (
                      <div className="bg-amber-100 text-amber-900 p-3 rounded-xl text-center text-xs font-bold">
                        ⚠️ Order minimum is {settings.min_order_cartons} cartons. Please add{" "}
                        {Number(settings.min_order_cartons || 2) - totalCartons} more carton to unlock checkout.
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCartDrawerOpen(false);
                          setCheckoutModalOpen(true);
                          setCanPayNowTick(false);
                        }}
                        className="w-full h-12 bg-[#0B57D0] hover:bg-[#0842A0] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer shadow-md"
                      >
                        Checkout
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3 text-[11px] text-zinc-600 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-[#0B57D0] shrink-0 mt-0.5" />
                  <span>Wholesale carton pricing with direct islandwide delivery or self-pickup in Eunos.</span>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: LOOSE MIX BUILDER (CARTON SIZE & DIMENSIONS BASED) */}
      {/* ========================================================= */}
      {mixBuilderOpen && mixBrand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-zinc-950">
                  Build Custom {mixBrand.display_name} Carton
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Pick any combination of items to make {activeTargetCartonSize} pcs.
                </p>
              </div>
              <button
                onClick={() => setMixBuilderOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Progress Bar Banner */}
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-3 shrink-0">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-900 mb-1.5">
                <span>Carton Progress</span>
                <span
                  className={
                    currentMixTotalBottles === activeTargetCartonSize ? "text-emerald-600 font-extrabold" : ""
                  }
                >
                  {currentMixTotalBottles} / {activeTargetCartonSize} Items Selected
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    currentMixTotalBottles === activeTargetCartonSize ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  style={{
                    width: `${Math.min(100, (currentMixTotalBottles / activeTargetCartonSize) * 100)}%`
                  }}
                />
              </div>
            </div>

            {/* Item Pickers Grouped by Carton Size */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {currentBrandCartonGroups.map((group) => {
                const isCurrentGroup = selectedCartonGroupKey === group.key;
                const maxAllowedPerSku = Math.max(1, group.carton_pcs - 1);

                return (
                  <div key={group.key} className="space-y-2">
                    {currentBrandCartonGroups.length > 1 && (
                      <div className="pt-2 pb-1 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-800">{group.label}</span>
                        <span className="text-[11px] font-medium text-zinc-500">{group.carton_pcs} pcs / ctn</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      {group.products
                        .filter((p) => p.status === "in_stock")
                        .map((product) => {
                          const currentQty = (isCurrentGroup ? mixSelections[product.sku] : 0) || 0;
                          const isAtSkuMax = currentQty >= maxAllowedPerSku;
                          const groupCurrentTotal = isCurrentGroup ? currentMixTotalBottles : 0;
                          const canAdd = groupCurrentTotal < group.carton_pcs && !isAtSkuMax;

                          return (
                            <div
                              key={product.sku}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3">
                                <img
                                  src={product.image}
                                  alt={product.display_name}
                                  className="w-10 h-10 object-contain rounded bg-white border border-slate-200"
                                />
                                <div>
                                  <div className="font-bold text-xs text-zinc-900">{product.display_name}</div>
                                  <div className="text-[11px] text-zinc-500 font-medium flex items-center gap-2">
                                    <span>${product.price_per_piece.toFixed(2)} / pc</span>
                                    {isAtSkuMax && (
                                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                                        Max {maxAllowedPerSku} in mix
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    if (currentQty > 0) {
                                      const next = { ...mixSelections };
                                      if (currentQty === 1) {
                                        delete next[product.sku];
                                      } else {
                                        next[product.sku] = currentQty - 1;
                                      }
                                      setMixSelections(next);
                                    }
                                  }}
                                  disabled={currentQty === 0}
                                  className="w-7 h-7 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-xs font-bold text-zinc-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="w-6 text-center text-xs font-bold text-zinc-950">{currentQty}</span>
                                <button
                                  onClick={() => {
                                    if (selectedCartonGroupKey !== group.key) {
                                      // User selected an item from a different size group -> reset previous group selections!
                                      setSelectedCartonGroupKey(group.key);
                                      setMixSelections({ [product.sku]: 1 });
                                    } else {
                                      if (canAdd) {
                                        setMixSelections({ ...mixSelections, [product.sku]: currentQty + 1 });
                                      }
                                    }
                                  }}
                                  disabled={isCurrentGroup && !canAdd}
                                  title={isAtSkuMax ? `Maximum ${maxAllowedPerSku} pcs of the same item allowed in a custom mix carton` : undefined}
                                  className="w-7 h-7 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-xs font-bold text-zinc-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            {(() => {
              const distinctCount = Object.values(mixSelections).filter((q) => q > 0).length;
              const isCartonFull = currentMixTotalBottles === activeTargetCartonSize;
              const hasOnlyOneSku = distinctCount < 2 && currentMixTotalBottles > 0;
              const canSubmit = isCartonFull && !hasOnlyOneSku;

              return (
                <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
                  <button
                    onClick={() => setMixBuilderOpen(false)}
                    className="h-10 px-4 border border-slate-200 bg-white hover:bg-slate-100 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveMixCarton}
                    disabled={!canSubmit}
                    className="h-10 px-5 bg-[#0B57D0] hover:bg-[#0842A0] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Check size={14} />
                    {!isCartonFull
                      ? `Select ${activeTargetCartonSize - currentMixTotalBottles} More`
                      : hasOnlyOneSku
                      ? `Pick at least 2 different items for mix`
                      : `Add Mix Carton (${activeTargetCartonSize} Pcs) to Cart`}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FULL-PAGE VIEW: EXPRESS CHECKOUT (GUEST MODE)             */}
      {/* ========================================================= */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto flex flex-col">
          {/* Sticky Top Header */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs">
            <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center text-center">
              <button
                type="button"
                onClick={() => {
                  setCheckoutModalOpen(false);
                  setCartDrawerOpen(true);
                }}
                className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer shadow-xs select-none shrink-0 mb-2"
              >
                <ArrowLeft size={14} className="text-zinc-600 shrink-0" />
                <span>Back to Cart</span>
              </button>

              <h3 className="text-base font-extrabold text-zinc-950">Express Checkout</h3>
              <p className="text-[11px] text-zinc-500">Zero password or login required. Instant PayNow SGQR.</p>
            </div>
          </div>

          {/* Checkout Body (2 Columns on Desktop) */}
          <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8 text-xs">
            <form onSubmit={handleProceedToPayment} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
              {/* Left Column: Form Details */}
              <div className="lg:col-span-7 space-y-6">
                {/* Delivery Method Selector */}
                <div>
                  <label className="font-bold text-zinc-800 text-xs block mb-2">Delivery Method *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod("doorstep")}
                      className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        deliveryMethod === "doorstep"
                          ? "border-[#0B57D0] bg-blue-50/60 ring-2 ring-[#0B57D0]/20"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-900">
                          <Truck size={15} className={deliveryMethod === "doorstep" ? "text-[#0B57D0]" : "text-zinc-500"} />
                          Doorstep Delivery
                        </div>
                        {deliveryMethod === "doorstep" && <Check size={14} className="text-[#0B57D0]" />}
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        Islandwide (2-3 days) • {subtotal >= Number(settings.free_delivery_threshold || 50) ? "FREE" : `$${Number(settings.delivery_fee || 5).toFixed(2)}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryMethod("pickup")}
                      className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        deliveryMethod === "pickup"
                          ? "border-[#0B57D0] bg-blue-50/60 ring-2 ring-[#0B57D0]/20"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-900">
                          <Building2 size={15} className={deliveryMethod === "pickup" ? "text-[#0B57D0]" : "text-zinc-500"} />
                          Warehouse Self-Pickup
                        </div>
                        {deliveryMethod === "pickup" && <Check size={14} className="text-[#0B57D0]" />}
                      </div>
                      <span className="text-[11px] text-emerald-600 font-bold">FREE ($0.00) • Eunos</span>
                    </button>
                  </div>
                </div>

                {/* Customer Contact */}
                <div className="space-y-3">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Contact Details</div>
                  <div>
                    <label className="font-semibold text-zinc-700 block mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Tan"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-[#0B57D0] focus:border-[#0B57D0]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-zinc-700 block mb-1">WhatsApp Mobile *</label>
                      <div className="flex rounded-xl border border-slate-300 bg-white focus-within:ring-1 focus-within:ring-[#0B57D0] focus-within:border-[#0B57D0] overflow-hidden">
                        <select
                          value={phoneCountryCode}
                          onChange={(e) => setPhoneCountryCode(e.target.value)}
                          className="bg-slate-50 hover:bg-slate-100 text-zinc-900 font-bold text-xs px-2.5 py-2.5 border-r border-slate-300 focus:outline-none cursor-pointer shrink-0"
                        >
                          {COUNTRY_CODES.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          required
                          placeholder="9123 4567"
                          value={phoneBody}
                          onChange={(e) => setPhoneBody(e.target.value.replace(/[^0-9\s-]/g, ""))}
                          className="flex-1 px-3.5 py-2.5 bg-transparent text-xs text-zinc-900 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="font-semibold text-zinc-700 block mb-1">Email (Optional)</label>
                      <input
                        type="email"
                        placeholder="alex@gmail.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-[#0B57D0] focus:border-[#0B57D0]"
                      />
                    </div>
                  </div>
                </div>

                {/* Conditional: Doorstep Delivery Inputs */}
                {deliveryMethod === "doorstep" && (
                  <div className="space-y-3 pt-1">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Delivery Address</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <label className="font-semibold text-zinc-700 block mb-1">Postal Code *</label>
                        <input
                          type="text"
                          required
                          placeholder="560123"
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-1 focus:ring-[#0B57D0] focus:border-[#0B57D0]"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="font-semibold text-zinc-700 block mb-1">Street Address *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Ang Mo Kio Ave 3, Block 123"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-[#0B57D0] focus:border-[#0B57D0]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-zinc-700 block mb-1">Unit Number (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. #08-12"
                        value={unitNo}
                        onChange={(e) => setUnitNo(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-[#0B57D0] focus:border-[#0B57D0]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-zinc-700 block mb-1">Special Delivery Instructions</label>
                      <input
                        type="text"
                        placeholder="e.g. Leave at door / shoe cabinet if not home"
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-[#0B57D0] focus:border-[#0B57D0]"
                      />
                    </div>
                  </div>
                )}

                {/* Conditional: Self-Pickup Warehouse Card */}
                {deliveryMethod === "pickup" && (
                  <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-200/80 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <MapPin className="text-[#0B57D0] shrink-0 mt-0.5" size={16} />
                      <div className="space-y-0.5">
                        <div className="font-bold text-xs text-zinc-950">Self-Pickup Warehouse Location:</div>
                        <div className="text-zinc-800 font-semibold leading-relaxed">
                          {settings.warehouse_address || "9 Eunos Ave 8A, EUNOS INDUSTRIAL ESTATE, Singapore 409461"}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-blue-200/60 text-[11px]">
                      <div className="bg-white/90 rounded-xl p-2.5 border border-blue-100">
                        <span className="text-zinc-500 block font-medium">Store Person Contact:</span>
                        <a
                          href={`https://wa.me/${(settings.store_person_contact || "+65 8234 5678").replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-[#0B57D0] hover:underline flex items-center gap-1 mt-0.5"
                        >
                          <Phone size={12} />
                          {settings.store_person_contact || "+65 8234 5678"}
                        </a>
                        <span className="text-[10px] text-zinc-400">({settings.store_person_name || "Warehouse Store Person"})</span>
                      </div>

                      <div className="bg-white/90 rounded-xl p-2.5 border border-blue-100">
                        <span className="text-zinc-500 block font-medium">Collection Hours:</span>
                        <span className="font-bold text-zinc-800 block mt-0.5">
                          {settings.pickup_hours || "Mon - Fri: 10:00 AM - 6:00 PM"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-zinc-700 block mb-1">Estimated Collection Time / Notes</label>
                      <input
                        type="text"
                        placeholder="e.g. Coming Friday 3:00 PM, plate SBA1234A"
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-[#0B57D0] focus:border-[#0B57D0]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Sticky Summary & Checkout Button */}
              <div className="lg:col-span-5 sticky top-24 space-y-4">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3 shadow-2xs">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider pb-1 border-b border-slate-200">
                    Order Summary ({totalCartons} Cartons)
                  </div>

                  <div className="flex justify-between text-zinc-600 pt-1">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-zinc-900">${subtotal.toFixed(2)}</span>
                  </div>

                  {discountInfo.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Discount ({discountInfo.ruleName}):</span>
                      <span>-${discountInfo.discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery:</span>
                    <span className={deliveryMethod === "pickup" || deliveryFee === 0 ? "text-emerald-600 font-bold" : "font-semibold text-zinc-900"}>
                      {deliveryMethod === "pickup" ? "FREE ($0.00 - Self Pickup)" : (deliveryFee === 0 ? "FREE" : `$${deliveryFee.toFixed(2)}`)}
                    </span>
                  </div>

                  <div className="flex justify-between text-base font-extrabold text-zinc-950 pt-2 border-t border-slate-200">
                    <span>Total to Pay via SGQR:</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>

                  {/* Readiness Confirmation Tick */}
                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none p-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={canPayNowTick}
                        onChange={(e) => setCanPayNowTick(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0B57D0] focus:ring-[#0B57D0] cursor-pointer shrink-0 accent-[#0B57D0]"
                      />
                      <span className="text-xs text-zinc-800 font-medium leading-snug">
                        I confirm that I am able to pay via <strong>PayNow QR code</strong> now.
                      </span>
                    </label>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmittingOrder || !isCheckoutFormValid}
                      className="w-full h-12 bg-[#0B57D0] hover:bg-[#0842A0] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSubmittingOrder ? "Preparing SGQR..." : "Continue Payment"}
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3 text-[11px] text-zinc-600 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-[#0B57D0] shrink-0 mt-0.5" />
                  <span>Instant PayNow SGQR will be generated for direct bank transfer without logging in.</span>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FULL-PAGE VIEW: DYNAMIC PAYNOW SGQR PAYMENT               */}
      {/* ========================================================= */}
      {paymentModalOpen && createdOrder && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto flex flex-col">
          {/* Top Header */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs">
            <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center text-center">
              <button
                type="button"
                onClick={handleCancelPayment}
                className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer shadow-xs select-none shrink-0 mb-2"
              >
                <ArrowLeft size={14} className="text-zinc-600 shrink-0" />
                <span>Cancel Payment</span>
              </button>

              <h3 className="text-base font-extrabold text-zinc-950">PayNow SGQR Payment</h3>
              <p className="text-[11px] text-zinc-500">
                Order <span className="font-mono font-bold text-zinc-700">{createdOrder.order_ref}</span> • Direct instant transfer
              </p>
            </div>
          </div>

          {/* Payment Body: 2 Columns on Desktop */}
          <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column (7 cols): QR Code and Save action */}
              <div className="lg:col-span-7 flex flex-col items-center sm:items-start text-center sm:text-left space-y-4">
                <div>
                  <h2 className="text-2xl font-black text-zinc-950 tracking-tight">Pay using PayNow</h2>
                  <p className="text-xs sm:text-sm text-zinc-600 mt-1.5 leading-relaxed">
                    <strong>Save</strong> and <strong>upload</strong> this QR code to your banking app's Scan & Pay page to complete this transfer, or scan directly with DBS PayLah!, OCBC, UOB, or GrabPay.
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="w-full flex flex-col items-center p-6 bg-white border border-slate-200 rounded-3xl shadow-xs">
                  {/* 5-Minute Expiry Countdown (Above QR Code) */}
                  <div className="w-full max-w-[270px] flex items-center justify-center gap-2 py-1.5 px-3.5 bg-amber-50 border border-amber-200/90 rounded-full text-xs font-bold text-amber-900 mb-3.5 shadow-2xs">
                    <Clock size={14} className="text-amber-600 shrink-0 animate-pulse" />
                    <span>
                      PayNow QR expires in {String(Math.floor(timeLeftSeconds / 60)).padStart(2, "0")}:{String(timeLeftSeconds % 60).padStart(2, "0")}
                    </span>
                  </div>

                  <div
                    id="sgqr-container"
                    className="p-3 bg-white rounded-2xl flex items-center justify-center"
                  >
                    <QRCodeCanvas
                      id="sgqr-canvas"
                      value={sgqrPayload}
                      size={240}
                      level="H"
                      fgColor="#7C1A78"
                      bgColor="#FFFFFF"
                      imageSettings={{
                        src: "/paynow-badge.png",
                        height: 52,
                        width: 52,
                        excavate: true
                      }}
                    />
                  </div>

                  {/* Save Button (like in Image 2) */}
                  <button
                    type="button"
                    onClick={handleDownloadQR}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-5 py-2 bg-slate-100 hover:bg-slate-200 text-zinc-800 text-xs font-bold rounded-full transition-colors cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <Download size={14} />
                    <span>Save</span>
                  </button>
                </div>

                {/* Quick Copy Helpers */}
                <div className="grid grid-cols-2 gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(settings.paynow_uen);
                      setCopiedToastText("UEN: " + settings.paynow_uen);
                      setTimeout(() => setCopiedToastText(""), 2500);
                    }}
                    className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer shadow-2xs"
                  >
                    <Copy size={13} />
                    <span>Copy UEN: {settings.paynow_uen}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdOrder.order_ref);
                      setCopiedToastText("Order Ref: " + createdOrder.order_ref);
                      setTimeout(() => setCopiedToastText(""), 2500);
                    }}
                    className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer shadow-2xs"
                  >
                    <Copy size={13} />
                    <span>Copy Ref: {createdOrder.order_ref}</span>
                  </button>
                </div>
              </div>

              {/* Right Column (5 cols, sticky): Summary, Amber Notice, Action Button */}
              <div className="lg:col-span-5 sticky top-24 space-y-4">
                {/* Payment Summary Card */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3 shadow-2xs">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider pb-1 border-b border-slate-200">
                    Payment Summary
                  </div>

                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-xs text-zinc-600 font-medium">Total Payable:</span>
                    <span className="text-2xl font-black text-zinc-950">
                      ${Number(createdOrder.total_amount).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-zinc-600">
                    <span>Order Reference:</span>
                    <span className="font-mono font-bold text-zinc-950">{createdOrder.order_ref}</span>
                  </div>

                  <div className="flex justify-between text-xs text-zinc-600">
                    <span>Payee / Merchant:</span>
                    <span className="font-semibold text-zinc-900">{settings.paynow_merchant_name || "HSG GLOBAL PTE LTD"}</span>
                  </div>
                </div>

                {/* Amber Warning Notice (Image 2 style, without #) */}
                <div className="bg-[#FFF9E6] border border-[#FFE799] rounded-2xl p-4 text-xs text-[#7A4B00] flex items-start gap-3 shadow-2xs">
                  <div className="w-5 h-5 rounded-full bg-[#FFC107] text-white font-black flex items-center justify-center shrink-0 text-xs mt-0.5">
                    !
                  </div>
                  <div className="leading-relaxed">
                    For your payment to be accepted, please enter PayNow reference as: <strong>{createdOrder.order_ref}</strong>
                  </div>
                </div>

                {/* Action Button: I have already paid only */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleAlreadyPaid}
                    className="w-full h-12 bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-sm rounded-full flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer shadow-md"
                  >
                    <CheckCircle2 size={18} />
                    <span>I have already paid</span>
                  </button>
                </div>

                <p className="text-[10px] text-zinc-400 text-center leading-relaxed">
                  Click "I have already paid" after completing your PayNow transfer to view your order confirmation and details.
                </p>
              </div>

            </div>
          </div>

          {/* Floating Toast Notifications */}
          {downloadSuccessToast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span>Image was saved to your downloads</span>
            </div>
          )}
          {copiedToastText && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span>{copiedToastText} copied to clipboard</span>
            </div>
          )}
          {expireToast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 border border-zinc-700">
              <AlertCircle size={16} className="text-amber-400" />
              <span>⚠️ Payment session expired (5 minutes). Order was cancelled.</span>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* STOREFRONT FOOTER                                         */}
      {/* ========================================================= */}
      {!trackedOrder && (
        <footer className="bg-white border-t border-slate-200 py-10 mt-auto">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-zinc-500">
            <div>
              <div className="font-extrabold text-sm text-zinc-900">{settings.company_name}</div>
              <div className="mt-1">UEN: {settings.company_uen} • Official Singapore Distribution</div>
              <div className="mt-0.5">Support WhatsApp: {settings.whatsapp_number} • {settings.support_email}</div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setPolicyModal("terms")}
                className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
              >
                Delivery Policy
              </button>
              <button
                onClick={() => setPolicyModal("refund")}
                className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
              >
                Refund Terms
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Policy Modal */}
      {policyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl">
            <h3 className="font-bold text-sm text-zinc-900 mb-2">
              {policyModal === "terms" ? "Delivery Terms Policy" : "Refund & Damaged Goods Policy"}
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              {policyModal === "terms" ? settings.delivery_terms : settings.refund_policy}
            </p>
            <button
              onClick={() => setPolicyModal(null)}
              className="mt-4 w-full h-9 bg-zinc-900 text-white rounded-lg text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
