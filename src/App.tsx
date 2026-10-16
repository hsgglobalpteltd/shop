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
  MessageSquare,
  Printer,
  FileText
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

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
  has_bcrs?: boolean;
  bcrs_amount?: number;
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
  max_order_amount?: number;
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
  has_bcrs?: boolean;
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

// Pre-warm browser cache with full-resolution master images
const prewarmCatalogImages = (prods: Product[]) => {
  if (typeof window === "undefined" || !Array.isArray(prods)) return;
  // Clear any legacy downscaled localstorage thumbnails
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("hsg_thumb_")) {
        localStorage.removeItem(k);
      }
    }
  } catch {}

  prods.forEach((p) => {
    if (p.image) {
      const img = new Image();
      img.src = p.image;
    }
  });
};

// Animated Order Completed Visual (from https://lottiefiles.com/free-animation/order-completed-FADHfyowES)
const OrderPreparingAnimation = () => {
  const [lottieError, setLottieError] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center select-none">
      {!lottieError ? (
        <div className="w-28 h-28 sm:w-36 sm:h-36 relative flex items-center justify-center">
          <DotLottieReact
            src="/order-completed.lottie"
            loop
            autoplay
            onError={() => setLottieError(true)}
            className="w-full h-full object-contain"
          />
        </div>
      ) : null}

      {/* High-quality Animated SVG: Always renders or falls back if Lottie fails */}
      {lottieError && (
        <div className="w-24 h-24 sm:w-32 sm:h-32 relative flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <style>{`
              @keyframes bounceBox {
                0%, 100% { transform: translateY(0px) rotate(0deg); }
                50% { transform: translateY(-7px) rotate(-1deg); }
              }
              @keyframes conveyorRoll {
                0% { stroke-dashoffset: 0; }
                100% { stroke-dashoffset: 24; }
              }
              @keyframes sparklePulse {
                0%, 100% { transform: scale(0.8); opacity: 0.4; }
                50% { transform: scale(1.2); opacity: 1; }
              }
              .box-anim { animation: bounceBox 2.2s ease-in-out infinite; transform-origin: 100px 130px; }
              .conveyor-anim { stroke-dasharray: 6 6; animation: conveyorRoll 1.2s linear infinite; }
              .sparkle-anim { animation: sparklePulse 1.8s ease-in-out infinite; transform-origin: center; }
            `}</style>
            
            {/* Background Glow */}
            <circle cx="100" cy="100" r="75" fill="#EFF6FF" />
            <circle cx="100" cy="100" r="60" fill="#DBEAFE" opacity="0.6" />

            {/* Conveyor Belt Base */}
            <path d="M40 145 H160" stroke="#94A3B8" strokeWidth="6" strokeLinecap="round" />
            <path d="M40 145 H160" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" className="conveyor-anim" />
            <circle cx="55" cy="155" r="4" fill="#64748B" />
            <circle cx="85" cy="155" r="4" fill="#64748B" />
            <circle cx="115" cy="155" r="4" fill="#64748B" />
            <circle cx="145" cy="155" r="4" fill="#64748B" />

            {/* Packaging Box */}
            <g className="box-anim">
              <rect x="62" y="78" width="76" height="58" rx="6" fill="#D97706" />
              <rect x="62" y="78" width="38" height="58" rx="6" fill="#B45309" />
              <path d="M62 88 L100 96 L138 88" stroke="#78350F" strokeWidth="2" fill="none" />
              <rect x="78" y="76" width="44" height="60" fill="#FCD34D" opacity="0.85" rx="1" />
              <rect x="70" y="104" width="22" height="16" rx="2" fill="#FFFFFF" />
              <line x1="73" y1="108" x2="89" y2="108" stroke="#0F172A" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="73" y1="112" x2="85" y2="112" stroke="#0B57D0" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="73" y1="116" x2="81" y2="116" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M124 106 L127 101 L130 106 M127 101 V115" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
            </g>

            {/* Sparkles */}
            <g className="sparkle-anim" style={{ transformOrigin: '150px 65px' }}>
              <path d="M150 55 L152 62 L159 64 L152 66 L150 73 L148 66 L141 64 L148 62 Z" fill="#F59E0B" />
            </g>
            <g className="sparkle-anim" style={{ transformOrigin: '48px 80px', animationDelay: '0.9s' }}>
              <path d="M48 72 L49.5 77 L54.5 78.5 L49.5 80 L48 85 L46.5 80 L41.5 78.5 L46.5 77 Z" fill="#3B82F6" />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
};

// Sanitize delivery notes: Strip legacy server-injected prefix and keep genuine customer notes only
const cleanCustomerNote = (notes?: string | null): string => {
  if (!notes) return "";
  let cleaned = notes.trim();
  cleaned = cleaned.replace(/\[SELF-PICKUP AT WAREHOUSE\][^\n•]*(?:•\s*Note:\s*)?/gi, "").trim();
  cleaned = cleaned.replace(/\[Auto-verified via PayNow Email alert:[^\]]*\]/gi, "").trim();
  cleaned = cleaned.replace(/\[REJECTED:[^\]]*\]/gi, "").trim();
  cleaned = cleaned.replace(/^•\s*|•\s*$/g, "").trim();
  cleaned = cleaned.replace(/^Note:\s*/gi, "").trim();
  return cleaned;
};

// Mask last 3 characters of each word in customer name with *
const maskCustomerName = (name?: string | null): string => {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length > 3) {
        return word.slice(0, word.length - 3) + "***";
      }
      if (word.length > 1) {
        return word.slice(0, 1) + "*".repeat(word.length - 1);
      }
      return "*";
    })
    .join(" ");
};

// Mask last 4 digits of customer phone number with *
const maskCustomerPhone = (phone?: string | null): string => {
  if (!phone) return "";
  const chars = phone.trim().split("");
  let replaced = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/\d/.test(chars[i])) {
      chars[i] = "*";
      replaced++;
      if (replaced === 4) break;
    }
  }
  return chars.join("");
};

// Milestone Timeline Steps Calculator
const getTimelineSteps = (order: any) => {
  const isPickup = order?.delivery_address?.toLowerCase().includes("self-pickup");
  const isPaid = order?.payment_status === "verified";
  const fulfillment = order?.fulfillment_status || "pending";

  let currentStep = 1;
  if (isPaid) currentStep = 2;
  if (isPaid && (fulfillment === "packing" || fulfillment === "in_progress")) currentStep = 3;
  if (fulfillment === "out_for_delivery" || fulfillment === "ready_for_pickup") currentStep = 4;
  if (fulfillment === "completed") currentStep = 5;

  return [
    {
      step: 1,
      title: "Order Placed",
      desc: order?.created_at
        ? new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "Order received",
      done: true,
      active: currentStep === 1
    },
    {
      step: 2,
      title: "Payment Verified",
      desc: isPaid
        ? (order.payment_verified_at ? `Verified ${new Date(order.payment_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "PayNow confirmed")
        : "Awaiting verification",
      done: isPaid,
      active: !isPaid
    },
    {
      step: 3,
      title: "Packing Cartons",
      desc: isPaid ? (currentStep > 3 ? "Packed & sealed" : "Warehouse packing") : "Queueing",
      done: currentStep > 3,
      active: isPaid && currentStep === 3
    },
    {
      step: 4,
      title: isPickup ? "Ready for Pickup" : "Out for Delivery",
      desc: isPickup
        ? (currentStep >= 4 ? "Ready at Eunos" : "Warehouse processing")
        : (currentStep >= 4 ? "Driver dispatched" : "Awaiting dispatch"),
      done: currentStep > 4,
      active: currentStep === 4
    },
    {
      step: 5,
      title: isPickup ? "Collected" : "Delivered",
      desc: fulfillment === "completed" ? "Order completed" : (isPickup ? "Awaiting collection" : "Estimated 2-3 days"),
      done: fulfillment === "completed",
      active: currentStep === 5
    }
  ];
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
    max_order_amount: 1000,
    show_hero_section: (() => {
      try {
        const cached = localStorage.getItem("hsg_show_hero_section");
        if (cached !== null) return cached === "true";
      } catch {}
      return false;
    })()
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
  const [showPromoInput, setShowPromoInput] = useState<boolean>(false);

  // Persist cart changes
  useEffect(() => {
    try {
      localStorage.setItem("hsg_shop_cart", JSON.stringify(cart));
    } catch (e) {
      console.warn("Failed to persist cart to localStorage", e);
    }
  }, [cart]);

  // Track footer line to dock floating cart bar directly centered on the middle line
  const footerRef = useRef<HTMLElement | null>(null);
  const floatingBarRef = useRef<HTMLDivElement | null>(null);
  const [footerOverlap, setFooterOverlap] = useState<number>(20);

  useEffect(() => {
    let rafId: number | null = null;

    const updatePosition = () => {
      if (!footerRef.current) {
        setFooterOverlap((prev) => (prev !== 20 ? 20 : prev));
        return;
      }

      // Dock floating bar so its vertical center aligns exactly on the footer divider line (middle line)
      const rect = footerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const lineDistance = windowHeight - rect.top;
      const barHeight = floatingBarRef.current?.offsetHeight || 56;
      const halfBar = barHeight / 2;

      const targetBottom = Math.max(20, Math.round(lineDistance - halfBar));
      setFooterOverlap((prev) => (Math.abs(prev - targetBottom) > 0.5 ? targetBottom : prev));
    };

    const handleScrollOrResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updatePosition();
        rafId = null;
      });
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        handleScrollOrResize();
      });
      ro.observe(document.body);
    }

    updatePosition();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      if (ro) ro.disconnect();
    };
  }, [selectedCategory, selectedBrandId, cart.length, loading]);

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
  const [expirePopupOpen, setExpirePopupOpen] = useState<boolean>(false);

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
  const [autoVerified, setAutoVerified] = useState<boolean>(false);

  // Tracking Screen Route (e.g. /order/HSG-XXXX or ?ref=HSG-XXXX)
  const [trackingOrderRef, setTrackingOrderRef] = useState<string>("");
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);

  // Thank You / Order Complete Screen Route (e.g. /complete?ref=HSG-XXXX)
  const [thankYouOrder, setThankYouOrder] = useState<any | null>(null);
  const [thankYouLoading, setThankYouLoading] = useState<boolean>(false);
  const [thankYouCopied, setThankYouCopied] = useState<boolean>(false);

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

  // Policy Modals & Simple URL Routing (/policy, /tnc)
  const [policyModal, setPolicyModal] = useState<"terms" | "refund" | null>(null);

  const cleanRoutePath = (path: string) => {
    try {
      const pure = path.split("?")[0].split("#")[0];
      return pure.toLowerCase().replace(/\/$/, "") || "/";
    } catch {
      return path;
    }
  };

  const [currentPath, setCurrentPath] = useState<string>(() => {
    try {
      return cleanRoutePath(window.location.pathname);
    } catch {
      return "/";
    }
  });

  const navigateTo = (path: string) => {
    try {
      window.history.pushState(null, "", path);
      setCurrentPath(cleanRoutePath(path));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.location.href = path;
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(cleanRoutePath(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const isPolicyRoute = currentPath === "/policy" || currentPath === "/privacy" || currentPath === "/privacy-policy";
  const isTncRoute = currentPath === "/tnc" || currentPath === "/terms" || currentPath === "/terms-and-conditions";
  const isTrackingRoute = currentPath === "/track" || currentPath === "/track-order" || currentPath === "/tracking" || currentPath.startsWith("/track/") || (Boolean(trackedOrder) && !thankYouOrder && currentPath !== "/complete" && currentPath !== "/order-complete" && currentPath !== "/thankyou");
  const isThankYouRoute = !isTrackingRoute && (currentPath === "/complete" || currentPath === "/order-complete" || currentPath === "/thankyou" || currentPath.startsWith("/complete/") || Boolean(thankYouOrder));

  // WhatsApp Customer Auth & Order History States
  const [authCustomerPhone, setAuthCustomerPhone] = useState<string>(() => {
    const normPath = window.location.pathname.toLowerCase().replace(/\/$/, "");
    const params = new URLSearchParams(window.location.search);
    if (normPath.startsWith("/track") || params.get("track") || params.get("ref")) {
      return "";
    }
    try { return localStorage.getItem("hsg_auth_phone") || ""; } catch { return ""; }
  });
  const [authCustomerName, setAuthCustomerName] = useState<string>(() => {
    const normPath = window.location.pathname.toLowerCase().replace(/\/$/, "");
    const params = new URLSearchParams(window.location.search);
    if (normPath.startsWith("/track") || params.get("track") || params.get("ref")) {
      return "";
    }
    try { return localStorage.getItem("hsg_auth_name") || ""; } catch { return ""; }
  });
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [loginSession, setLoginSession] = useState<any | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [orderHistoryModalOpen, setOrderHistoryModalOpen] = useState<boolean>(false);
  const [pastOrders, setPastOrders] = useState<any[]>([]);
  const [pastOrdersLoading, setPastOrdersLoading] = useState<boolean>(false);
  const [authCopied, setAuthCopied] = useState<boolean>(false);

  // Track Page 4-Digit Phone Owner Verification States
  const [verifyOwnerModalOpen, setVerifyOwnerModalOpen] = useState<boolean>(false);
  const [verifyDigits, setVerifyDigits] = useState<string[]>(["", "", "", ""]);
  const [verifyError, setVerifyError] = useState<string>("");
  const [isTrackOwnerVerified, setIsTrackOwnerVerified] = useState<boolean>(false);
  const [verifyLockoutUntil, setVerifyLockoutUntil] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("hsg_verify_lockout_until") || "0");
      return saved > Date.now() ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [verifyLockoutRemainingSec, setVerifyLockoutRemainingSec] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("hsg_verify_lockout_until") || "0");
      return saved > Date.now() ? Math.ceil((saved - Date.now()) / 1000) : 0;
    } catch {
      return 0;
    }
  });
  const verifyInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  useEffect(() => {
    if (!verifyLockoutUntil || verifyLockoutUntil <= Date.now()) {
      setVerifyLockoutRemainingSec(0);
      return;
    }
    const updateRemaining = () => {
      const rem = Math.max(0, Math.ceil((verifyLockoutUntil - Date.now()) / 1000));
      setVerifyLockoutRemainingSec(rem);
      if (rem <= 0) {
        setVerifyLockoutUntil(0);
        setVerifyError("");
        try {
          localStorage.removeItem("hsg_verify_lockout_until");
        } catch {}
      }
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [verifyLockoutUntil]);

  const handleVerifyOwnerSubmit = (digitsToVerify?: string[]) => {
    if (verifyLockoutUntil > Date.now()) return;
    const digits = digitsToVerify || verifyDigits;
    const entered = digits.join("").trim();
    if (entered.length < 4) {
      setVerifyError("Please enter all 4 digits.");
      return;
    }
    const actualLast4 = (trackedOrder?.customer_phone || "").replace(/\D/g, "").slice(-4);
    if (actualLast4 && entered === actualLast4) {
      setVerifyError("");
      setIsTrackOwnerVerified(true);
      setVerifyOwnerModalOpen(false);
      setVerifyDigits(["", "", "", ""]);
      const p = trackedOrder.customer_phone;
      const n = trackedOrder.customer_name || "";
      setAuthCustomerPhone(p);
      if (n) setAuthCustomerName(n);
      setOrderHistoryModalOpen(true);
      fetchPastOrders(p);
    } else {
      const lockUntil = Date.now() + 5 * 60 * 1000;
      setVerifyLockoutUntil(lockUntil);
      setVerifyLockoutRemainingSec(300);
      setVerifyDigits(["", "", "", ""]);
      setVerifyError("Incorrect last 4 digits. Please wait 5 minutes to try again.");
      try {
        localStorage.setItem("hsg_verify_lockout_until", String(lockUntil));
      } catch {}
    }
  };

  const handleOpenLogin = async () => {
    setLoginLoading(true);
    setLoginModalOpen(true);
    try {
      const res = await fetch(`${WORKER_URL}/api/shop/auth/whatsapp/init`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLoginSession(data);
        }
      }
    } catch (err) {
      console.error("Auth init failed", err);
    } finally {
      setLoginLoading(false);
    }
  };

  const fetchPastOrders = async (phone: string) => {
    setPastOrdersLoading(true);
    try {
      const res = await fetch(`${WORKER_URL}/api/shop/customer/orders?phone=${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPastOrders(data.orders || []);
        }
      }
    } catch (err) {
      console.error("Fetch past orders failed", err);
    } finally {
      setPastOrdersLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthCustomerPhone("");
    setAuthCustomerName("");
    setIsTrackOwnerVerified(false);
    try {
      localStorage.removeItem("hsg_auth_phone");
      localStorage.removeItem("hsg_auth_name");
    } catch (e) {}
    setOrderHistoryModalOpen(false);
  };

  // Real-time WhatsApp Inbound Webhook Polling
  useEffect(() => {
    if (!loginModalOpen || !loginSession?.session_id) return;
    let isMounted = true;

    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(
          `${WORKER_URL}/api/shop/auth/whatsapp/poll?session_id=${encodeURIComponent(loginSession.session_id)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.status === "verified" && isMounted) {
            clearInterval(pollTimer);
            const verifiedPhone = data.customer_phone;
            const verifiedName = data.customer_name || "";
            setAuthCustomerPhone(verifiedPhone);
            setAuthCustomerName(verifiedName);
            try {
              localStorage.setItem("hsg_auth_phone", verifiedPhone);
              if (verifiedName) localStorage.setItem("hsg_auth_name", verifiedName);
              if (!phoneBody) {
                const cleanBody = verifiedPhone.replace(/^\+?65/, "");
                setPhoneBody(cleanBody);
              }
              if (!customerName && verifiedName) {
                setCustomerName(verifiedName);
              }
            } catch (e) {}

            setLoginModalOpen(false);
            setLoginSession(null);
            setOrderHistoryModalOpen(true);
            fetchPastOrders(verifiedPhone);
          }
        }
      } catch (err) {
        // ignore network error
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
    };
  }, [loginModalOpen, loginSession, phoneBody, customerName]);

  // 1. Initial Load & Check URL parameters for Order Tracking or Thank You
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    let pathRef = "";
    if ((pathParts[0] === "track" || pathParts[0] === "track-order" || pathParts[0] === "complete" || pathParts[0] === "thankyou" || pathParts[0] === "order-complete") && pathParts[1]) {
      pathRef = pathParts[1];
    }
    const refParam = params.get("ref") || params.get("track") || params.get("order") || pathRef;

    const normPath = window.location.pathname.toLowerCase().replace(/\/$/, "");
    if (normPath === "/complete" || normPath === "/order-complete" || normPath === "/thankyou" || normPath.startsWith("/complete/")) {
      if (refParam) {
        loadThankYouOrder(refParam);
      }
    } else if (normPath === "/track" || normPath === "/track-order" || normPath.startsWith("/track/")) {
      if (refParam) {
        setTrackingOrderRef(refParam);
        loadTrackedOrder(refParam);
      }
    } else if (refParam && (params.get("track") || params.get("ref"))) {
      // Legacy link like /?track=HSG-XXXX or /?ref=HSG-XXXX
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
        if (Array.isArray(data.products)) {
          prewarmCatalogImages(data.products);
        }
        if (data.settings) {
          setSettings(data.settings);
          try {
            localStorage.setItem("hsg_show_hero_section", String(Boolean(data.settings.show_hero_section)));
          } catch {}
        }
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
        if (data.success && data.order) {
          setTrackedOrder((prev: any) => {
            if (!prev || prev.order_ref !== data.order.order_ref) {
              setIsTrackOwnerVerified(false);
              setVerifyDigits(["", "", "", ""]);
              setVerifyError("");
            }
            return data.order;
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTrackingLoading(false);
    }
  };

  const loadThankYouOrder = async (ref: string) => {
    setThankYouLoading(true);
    try {
      const res = await fetch(`${WORKER_URL}/api/shop/order-status?ref=${encodeURIComponent(ref)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.order) {
          setThankYouOrder(data.order);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setThankYouLoading(false);
    }
  };

  // Auto-poll thank you order status if payment is not yet verified
  useEffect(() => {
    if (!thankYouOrder || thankYouOrder.payment_status === "verified") return;

    const interval = setInterval(() => {
      fetch(`${WORKER_URL}/api/shop/order-status?ref=${encodeURIComponent(thankYouOrder.order_ref)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.order) {
            setThankYouOrder(data.order);
          }
        })
        .catch(() => {});
    }, 8000);

    return () => clearInterval(interval);
  }, [thankYouOrder]);

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

  // Product SKU Map for fast property lookup
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.sku, p));
    return map;
  }, [products]);

  // Calculate total BCRS deposit ($0.10 per eligible beverage container, 0% tax)
  const totalBcrs = useMemo(() => {
    let bcrs = 0;
    for (const item of cart) {
      if (item.carton_type === "custom_mix" && item.loose_bottles) {
        for (const lb of item.loose_bottles) {
          const prod = productMap.get(lb.sku);
          if (prod?.has_bcrs) {
            bcrs += (lb.qty || 0) * (item.carton_qty || 1) * 0.10;
          }
        }
      } else if (item.sku) {
        const prod = productMap.get(item.sku);
        if (prod?.has_bcrs || item.has_bcrs) {
          const pcs = Number(item.carton_pcs || prod?.carton_pcs || 24);
          bcrs += (item.carton_qty || 1) * pcs * 0.10;
        }
      }
    }
    return Number(bcrs.toFixed(2));
  }, [cart, productMap]);

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
    return Number((effectiveSubtotal + deliveryFee + totalBcrs).toFixed(2));
  }, [subtotal, discountInfo.discountAmount, deliveryFee, totalBcrs]);

  const maxOrderLimit = Number(settings.max_order_amount || 1000);
  const isOrderExceedingLimit = totalAmount > maxOrderLimit || subtotal > maxOrderLimit;
  const canCheckout = totalCartons >= Number(settings.min_order_cartons || 2) && !isOrderExceedingLimit && settings.is_store_open;

  const isCheckoutFormValid = useMemo(() => {
    if (isOrderExceedingLimit) return false;
    const hasName = customerName.trim().length > 0;
    const cleanPhone = phoneBody.replace(/[^0-9]/g, "");
    const hasPhone = cleanPhone.length >= 8;
    const isPickup = deliveryMethod === "pickup";
    const hasAddress = isPickup || (postalCode.trim().length >= 6 && deliveryAddress.trim().length > 0);
    return hasName && hasPhone && hasAddress && canPayNowTick;
  }, [customerName, phoneBody, deliveryMethod, postalCode, deliveryAddress, canPayNowTick, isOrderExceedingLimit]);

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
            price_per_piece: product.price_per_piece,
            carton_pcs: product.carton_pcs,
            has_bcrs: Boolean(product.has_bcrs)
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
        delivery_fee: deliveryFee,
        total_bcrs: totalBcrs
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

        // Auto-login customer so they can directly see past order history
        const autoPhone = data.order?.customer_phone || customerPhone;
        const autoName = data.order?.customer_name || customerName;
        if (autoPhone) {
          setAuthCustomerPhone(autoPhone);
          if (autoName) setAuthCustomerName(autoName);
          try {
            localStorage.setItem("hsg_auth_phone", autoPhone);
            if (autoName) localStorage.setItem("hsg_auth_name", autoName);
          } catch (e) {}
          fetchPastOrders(autoPhone);
        }

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
    setAutoVerified(false);
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

  // Auto-Expire Action on 00:00 (Opens popup while keeping QR code page blurred in background)
  const handleExpirePayment = async () => {
    const orderToCancel = createdOrder?.order_ref;
    setExpirePopupOpen(true);
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

    // Set thank you order to current order, close payment modal, and navigate to /complete?ref=...
    setThankYouOrder(createdOrder);
    setPaymentModalOpen(false);

    navigateTo(`/complete?ref=${createdOrder.order_ref}`);

    // Refresh live order state from backend
    loadThankYouOrder(createdOrder.order_ref);
  };

  // Real-time Polling for PayNow Inbound Bank Transfer (Email Webhook Detection)
  useEffect(() => {
    if (!paymentModalOpen || !createdOrder?.order_ref) return;

    let isMounted = true;
    let pollInterval: any = null;
    let redirectTimer: any = null;

    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${WORKER_URL}/api/shop/order-status?ref=${encodeURIComponent(createdOrder.order_ref)}`, {
          cache: "no-store"
        });
        if (!res.ok) return;
        const data = (await res.json()) as { success: boolean; order: any };
        if (!isMounted) return;

        if (data?.order?.payment_status === "verified") {
          clearInterval(pollInterval);
          setAutoVerified(true);

          const confirmedOrder = data.order || createdOrder;

          // Transition to Thank You page after 1.2s visual feedback
          redirectTimer = setTimeout(() => {
            setCart([]);
            setAppliedPromoCode("");
            clearPaymentSession();
            setThankYouOrder(confirmedOrder);
            setPaymentModalOpen(false);

            navigateTo(`/complete?ref=${confirmedOrder.order_ref}`);

            loadThankYouOrder(confirmedOrder.order_ref);
          }, 1200);
        }
      } catch (err) {
        // silent fail on network blip
      }
    }, 2500);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [paymentModalOpen, createdOrder?.order_ref]);

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
      {!trackedOrder && !thankYouOrder && !isPolicyRoute && !isTncRoute && !isThankYouRoute && !isTrackingRoute && (
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

              {/* Header Right Controls: Cart */}
              <div className="flex items-center gap-2">
                {/* Cart Floating Pill Header Link (Hidden when cart is empty) */}
                {cart.length > 0 && (
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
                )}
              </div>
            </div>
          </header>
        </>
      )}

      {/* ========================================================= */}
      {/* PRIVACY POLICY VIEW (/policy)                             */}
      {/* ========================================================= */}
      {isPolicyRoute ? (
        <div className="flex-1 flex flex-col min-h-screen bg-[#F8F9FA] font-primary">
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs">
            <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center text-center">
              <button
                type="button"
                onClick={() => navigateTo("/")}
                className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer shadow-xs select-none shrink-0 mb-2"
              >
                <ArrowLeft size={14} className="text-zinc-600 shrink-0" />
                <span>Back to Storefront</span>
              </button>
              <h3 className="text-base font-extrabold text-zinc-950">Privacy Policy</h3>
              <p className="text-[11px] text-zinc-500">
                HSG GLOBAL PTE. LTD. • Official Singapore Wholesale Platform
              </p>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6 text-xs text-zinc-700 leading-relaxed">
              <div className="border-b border-slate-100 pb-4">
                <h1 className="text-xl font-black text-zinc-950">Privacy Policy</h1>
                <p className="text-xs text-zinc-400 mt-1">Last Updated: October 2026 • Effective Immediately</p>
              </div>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">1. Overview</h2>
                <p>
                  HSG Global Pte. Ltd. ("we", "our", or "us", UEN: 201627632D) operates <strong>shop.hsgglobal.sg</strong>. We respect your privacy and are committed to safeguarding personal data in compliance with the Singapore Personal Data Protection Act (PDPA).
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">2. Information We Collect</h2>
                <p>When you browse, order, or authenticate on our storefront, we collect:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-600">
                  <li><strong>Contact Details:</strong> Customer name, delivery address, postal code, phone number, and optional email address.</li>
                  <li><strong>Wholesale Order Data:</strong> Selected brand beverages, carton quantities, order references, and delivery notes.</li>
                  <li><strong>Payment Verification:</strong> PayNow transaction references and bank transfer snapshots. We do not store credit card or banking credentials.</li>
                  <li><strong>WhatsApp Authentication:</strong> Mobile phone numbers and 6-digit one-time verification codes sent via WhatsApp Cloud API for order history lookup.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">3. Purpose of Processing</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-600">
                  <li>Processing, packing, and dispatching wholesale carton shipments to your address or warehouse self-pickup.</li>
                  <li>Verifying PayNow SGQR bank transfers and issuing digital order receipts.</li>
                  <li>Providing real-time order tracking updates and automated passwordless login via WhatsApp.</li>
                  <li>Customer service support and addressing delivery inquiries or quality claims.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">4. Data Sharing & Protection</h2>
                <p>
                  We never sell or rent your personal information to third parties. Customer details are shared strictly with authorized logistics and warehouse staff solely for order fulfillment, or when required by Singapore regulatory authorities.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">5. Data Retention & Your Rights</h2>
                <p>
                  Personal data is retained strictly as necessary to comply with legal, tax, and order fulfillment obligations. You have the right to request access to or correction of your personal data by contacting us.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">6. Contact Us</h2>
                <p>For any privacy or data-related inquiries, reach us at:</p>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-zinc-700">
                  <div className="font-bold text-zinc-900">HSG GLOBAL PTE. LTD.</div>
                  <div>UEN: 201627632D</div>
                  <div>Warehouse: 9 Eunos Ave 8A, Eunos Industrial Estate, Singapore 409461</div>
                  <div>Official Support WhatsApp: +65 8475 5948</div>
                  <div>Email: sales@hsg-global.com</div>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : isTncRoute ? (
        <div className="flex-1 flex flex-col min-h-screen bg-[#F8F9FA] font-primary">
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs">
            <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center text-center">
              <button
                type="button"
                onClick={() => navigateTo("/")}
                className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer shadow-xs select-none shrink-0 mb-2"
              >
                <ArrowLeft size={14} className="text-zinc-600 shrink-0" />
                <span>Back to Storefront</span>
              </button>
              <h3 className="text-base font-extrabold text-zinc-950">Terms & Conditions</h3>
              <p className="text-[11px] text-zinc-500">
                HSG GLOBAL PTE. LTD. • Official Singapore Wholesale Platform
              </p>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6 text-xs text-zinc-700 leading-relaxed">
              <div className="border-b border-slate-100 pb-4">
                <h1 className="text-xl font-black text-zinc-950">Terms & Conditions</h1>
                <p className="text-xs text-zinc-400 mt-1">Last Updated: October 2026 • Governed under Singapore Law</p>
              </div>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">1. Acceptance of Terms</h2>
                <p>
                  By accessing <strong>shop.hsgglobal.sg</strong> and placing wholesale carton orders, you agree to be bound by these Terms and Conditions. These terms govern all sales and deliveries provided by HSG Global Pte. Ltd. (UEN: 201627632D).
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">2. Wholesale Carton Ordering & MOQ</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-600">
                  <li><strong>Minimum Order Quantity:</strong> A minimum requirement of 2 cartons per order applies across all brands.</li>
                  <li><strong>Custom Mixed Cartons:</strong> Loose bottle custom carton mixes must match the exact bottle capacity specified for each carton size group (e.g., 24 bottles per carton).</li>
                  <li>All orders are subject to inventory availability at our Singapore warehouse.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">3. Pricing & PayNow Payments</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-600">
                  <li>All prices are in Singapore Dollars (SGD).</li>
                  <li>Payments are verified via Singapore PayNow SGQR to UEN <strong>201627632D</strong> (HSG GLOBAL PTE LTD).</li>
                  <li>Orders will be packed and dispatched once the PayNow transfer reference is verified.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">4. Delivery & Self-Pickup</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-600">
                  <li><strong>Doorstep Delivery:</strong> Standard delivery across mainland Singapore within 2 to 3 business days. Free delivery applies above the specified order amount.</li>
                  <li><strong>Warehouse Pickup:</strong> Free self-pickup is available at 9 Eunos Ave 8A, Singapore 409461 (Mon-Fri 10am - 6pm) once the order status is updated to ready.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">5. Refunds & Damaged Goods Policy</h2>
                <p>
                  Due to the nature of wholesale beverage distribution, orders are non-refundable once dispatched. Any transit damage or manufacturer defect must be reported within 24 hours of delivery via WhatsApp (+65 8475 5948) with photo proof for prompt replacement.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-zinc-900">6. Governing Law</h2>
                <p>
                  These Terms are governed by and construed in accordance with the laws of the Republic of Singapore.
                </p>
              </section>
            </div>
          </div>
        </div>
      ) : isThankYouRoute ? (() => {
        const handleBackToStore = () => {
          setTrackedOrder(null);
          setThankYouOrder(null);
          setTrackingOrderRef("");
          navigateTo("/");
        };

        if (thankYouLoading && !thankYouOrder) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] font-primary px-4">
              <RefreshCw size={28} className="animate-spin text-[#0B57D0] mb-3" />
              <p className="text-sm font-bold text-zinc-800">Loading Order Confirmation...</p>
            </div>
          );
        }

        if (!thankYouOrder) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] font-primary px-4 text-center">
              <AlertCircle size={36} className="text-amber-500 mb-3" />
              <h2 className="text-lg font-black text-zinc-900">Order Not Found</h2>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                We could not locate this order reference. Please check your link or return to the storefront.
              </p>
              <button
                type="button"
                onClick={handleBackToStore}
                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-zinc-800 font-bold text-xs rounded-xl cursor-pointer"
              >
                ← Back to Storefront
              </button>
            </div>
          );
        }

        const isVerified = thankYouOrder.payment_status === "verified";
        const isPickup = thankYouOrder.delivery_address?.toLowerCase().includes("self-pickup");
        const trackingUrl = `${window.location.origin}/track?ref=${thankYouOrder.order_ref}`;

        // Calculate BCRS deposit if applicable
        const thankYouBcrsAmount = (() => {
          if (thankYouOrder?.total_bcrs !== undefined && Number(thankYouOrder.total_bcrs) > 0) {
            return Number(thankYouOrder.total_bcrs);
          }
          let bcrs = 0;
          if (Array.isArray(thankYouOrder?.items)) {
            for (const item of thankYouOrder.items) {
              if (item.carton_type === "custom_mix" && Array.isArray(item.loose_bottles)) {
                for (const lb of item.loose_bottles) {
                  const prod = productMap.get(lb.sku);
                  if (prod?.has_bcrs || lb.has_bcrs) {
                    bcrs += (lb.qty || 0) * (item.carton_qty || 1) * 0.10;
                  }
                }
              } else if (item.sku) {
                const prod = productMap.get(item.sku);
                if (prod?.has_bcrs || item.has_bcrs) {
                  const pcs = Number(item.carton_pcs || prod?.carton_pcs || 24);
                  bcrs += (item.carton_qty || 1) * pcs * 0.10;
                }
              }
            }
          }
          if (bcrs > 0) return Number(bcrs.toFixed(2));
          const directSub = Number(thankYouOrder?.subtotal || 0);
          if (directSub > 0) {
            const diff = Number(thankYouOrder?.total_amount || 0) - (directSub - Number(thankYouOrder?.discount_amount || 0) + Number(thankYouOrder?.delivery_fee || 0));
            if (diff > 0.05) return Number(diff.toFixed(2));
          }
          return 0;
        })();

        return (
          <div className="flex-1 flex flex-col min-h-[100dvh] bg-white font-primary">
            {/* Top Header */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs shrink-0">
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
                <p className="text-[11px] text-zinc-500 font-mono">
                  Order <span className="font-bold text-zinc-700">{thankYouOrder.order_ref}</span>
                </p>
              </div>
            </div>

            {/* Main Canvas: Confirmation Directly Under Original Header, CTA at Bottom */}
            <main className="flex-1 w-full max-w-md mx-auto px-4 sm:px-6 pt-1 pb-6 sm:pb-8 flex flex-col justify-between items-center text-center">
              
              {/* TOP ZONE (Directly under original header) */}
              <div className="w-full flex flex-col items-center text-center space-y-3 shrink-0">
                <div className="flex flex-col items-center">
                  <OrderPreparingAnimation />
                  <div className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#0B57D0] border border-blue-200 mt-1">
                    <span>HSG GLOBAL SHOP</span>
                  </div>
                </div>

                <div className="space-y-1.5 w-full">
                  <h1 className="text-2xl sm:text-3xl font-black text-zinc-950 tracking-tight">
                    Your Order Is Confirmed!
                  </h1>
                  <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed max-w-sm mx-auto">
                    We have received your order details. Our warehouse team is packing and preparing your cartons.
                  </p>
                </div>
              </div>

              {/* BOTTOM ZONE: Pinned at bottom */}
              <div className="w-full flex flex-col items-center space-y-3 shrink-0">
                <div className="w-full space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = thankYouOrder;
                      const ref = target?.order_ref;
                      if (!ref) return;
                      setTrackedOrder(target);
                      setTrackingOrderRef(ref);
                      setThankYouOrder(null);
                      navigateTo(`/track?ref=${ref}`);
                      loadTrackedOrder(ref);
                    }}
                    className="w-full h-12 rounded-xl sm:rounded-2xl bg-[#0B57D0] hover:bg-[#0842A0] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-xs transition-transform active:scale-98 cursor-pointer"
                  >
                    <Package size={16} />
                    <span>Track Order & View Digital Receipt →</span>
                  </button>

                  <p className="text-[11px] text-zinc-400 text-center">
                    View live order status and receipt anytime.
                  </p>
                </div>

                {/* Bottom Policy Footer */}
                <footer className="pt-1 text-center text-xs text-zinc-400 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPolicyModal("terms")}
                    className="hover:text-zinc-700 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Delivery Policy
                  </button>
                  <span className="text-zinc-300">•</span>
                  <button
                    type="button"
                    onClick={() => setPolicyModal("refund")}
                    className="hover:text-zinc-700 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Refund Terms
                  </button>
                </footer>
              </div>

            </main>
          </div>
        );
      })() : isTrackingRoute ? (() => {
        const handleBackToStore = () => {
          setTrackedOrder(null);
          setThankYouOrder(null);
          setTrackingOrderRef("");
          navigateTo("/");
        };

        if (trackingLoading && !trackedOrder) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] font-primary px-4">
              <RefreshCw size={28} className="animate-spin text-[#0B57D0] mb-3" />
              <p className="text-sm font-bold text-zinc-800">Loading Order Tracking Details...</p>
            </div>
          );
        }

        if (!trackedOrder) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] font-primary px-4 text-center">
              <AlertCircle size={36} className="text-amber-500 mb-3" />
              <h2 className="text-lg font-black text-zinc-900">Order Not Found</h2>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                We could not locate this order tracking reference. Please check your link.
              </p>
              <button
                type="button"
                onClick={handleBackToStore}
                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-zinc-800 font-bold text-xs rounded-xl cursor-pointer"
              >
                ← Back to Storefront
              </button>
            </div>
          );
        }

        const isVerified = trackedOrder.payment_status === "verified";
        const isPickup = trackedOrder.delivery_address?.toLowerCase().includes("self-pickup");
        const timelineSteps = getTimelineSteps(trackedOrder);

        // Calculate BCRS deposit ($0.10 per beverage container)
        const bcrsAmount = (() => {
          if (trackedOrder?.total_bcrs !== undefined && Number(trackedOrder.total_bcrs) > 0) {
            return Number(trackedOrder.total_bcrs);
          }
          let bcrs = 0;
          if (Array.isArray(trackedOrder?.items)) {
            for (const item of trackedOrder.items) {
              if (item.carton_type === "custom_mix" && Array.isArray(item.loose_bottles)) {
                for (const lb of item.loose_bottles) {
                  const prod = productMap.get(lb.sku);
                  if (prod?.has_bcrs || lb.has_bcrs) {
                    bcrs += (lb.qty || 0) * (item.carton_qty || 1) * 0.10;
                  }
                }
              } else if (item.sku) {
                const prod = productMap.get(item.sku);
                if (prod?.has_bcrs || item.has_bcrs) {
                  const pcs = Number(item.carton_pcs || prod?.carton_pcs || 24);
                  bcrs += (item.carton_qty || 1) * pcs * 0.10;
                }
              }
            }
          }
          if (bcrs > 0) return Number(bcrs.toFixed(2));

          const directSub = Number(trackedOrder?.subtotal || 0);
          if (directSub > 0) {
            const diff = Number(trackedOrder?.total_amount || 0) - (directSub - Number(trackedOrder?.discount_amount || 0) + Number(trackedOrder?.delivery_fee || 0));
            if (diff > 0.05) return Number(diff.toFixed(2));
          }
          return 0;
        })();

        const orderSubtotal = (() => {
          if (trackedOrder?.subtotal !== undefined && Number(trackedOrder.subtotal) > 0) {
            return Number(trackedOrder.subtotal);
          }
          return Math.max(0, Number(trackedOrder.total_amount || 0) - Number(trackedOrder.delivery_fee || 0) + Number(trackedOrder.discount_amount || 0) - bcrsAmount);
        })();

        return (
          <div className="flex-1 flex flex-col min-h-screen bg-[#F8F9FA] font-primary">
            {/* Top Header (Print Hidden) */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 py-3.5 px-4 shadow-2xs print:hidden">
              <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center text-center">
                <button
                  type="button"
                  onClick={handleBackToStore}
                  className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer shadow-xs select-none shrink-0 mb-2"
                >
                  <ArrowLeft size={14} className="text-zinc-600 shrink-0" />
                  <span>Back to Storefront</span>
                </button>

                <h3 className="text-base font-extrabold text-zinc-950">Order Tracking & Receipt</h3>
                <p className="text-[11px] text-zinc-500 font-mono">
                  Order <span className="font-bold text-zinc-700">{trackedOrder.order_ref}</span>
                </p>
              </div>
            </div>

            {/* Main Tracking Content */}
            <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 space-y-6">

              {/* 1. TIMELINE STATUS CARD (Print Hidden) */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-xs space-y-5 print:hidden">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-100 pb-3 text-center sm:text-left">
                  <div className="text-center sm:text-left">
                    <h2 className="text-base font-bold text-zinc-950">Fulfillment Timeline</h2>
                    <p className="text-xs text-zinc-500">Live order milestone tracking</p>
                  </div>
                  <div className="flex items-center justify-center gap-2 flex-wrap sm:flex-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        if (isTrackOwnerVerified) {
                          const p = trackedOrder.customer_phone || authCustomerPhone;
                          setOrderHistoryModalOpen(true);
                          if (p) fetchPastOrders(p);
                        } else {
                          setVerifyDigits(["", "", "", ""]);
                          if (verifyLockoutUntil <= Date.now()) {
                            setVerifyError("");
                          }
                          setVerifyOwnerModalOpen(true);
                          setTimeout(() => verifyInputRefs.current[0]?.focus(), 80);
                        }
                      }}
                      className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer shrink-0"
                      title="View All My Orders"
                    >
                      <Package size={13} className="text-[#0B57D0]" />
                      <span>My Orders</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer shrink-0"
                      title="Print Receipt"
                    >
                      <Printer size={13} />
                      <span>Print Receipt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadTrackedOrder(trackedOrder.order_ref)}
                      className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-zinc-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer shrink-0"
                      title="Refresh Status"
                    >
                      <RefreshCw size={13} className={trackingLoading ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>

                {/* Stepper Progress Bar (Desktop & Mobile) */}
                <div className="relative pt-2 pb-2">
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {timelineSteps.map((s, idx) => (
                      <div key={idx} className="flex flex-col items-center relative">
                        {/* Step Node */}
                        <div
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all z-10 ${
                            s.done
                              ? "bg-[#0B57D0] text-white shadow-xs"
                              : s.active
                              ? "bg-blue-100 text-[#0B57D0] ring-4 ring-blue-50 font-black"
                              : "bg-slate-100 text-zinc-400 border border-slate-200"
                          }`}
                        >
                          {s.done ? <Check size={16} strokeWidth={2.5} /> : s.step}
                        </div>

                        {/* Title & Desc */}
                        <div className="mt-2 space-y-0.5">
                          <span className={`block text-[11px] sm:text-xs font-bold leading-tight ${
                            s.done || s.active ? "text-zinc-900" : "text-zinc-400"
                          }`}>
                            {s.title}
                          </span>
                          <span className="hidden sm:block text-[10px] text-zinc-500 leading-tight">
                            {s.desc}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Connecting Bar */}
                  <div className="absolute top-6 sm:top-6.5 left-8 right-8 h-0.5 bg-slate-200 -z-0">
                    <div
                      className="h-full bg-[#0B57D0] transition-all duration-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, ((timelineSteps.filter(s => s.done).length - 1) / (timelineSteps.length - 1)) * 100))}%`
                      }}
                    />
                  </div>
                </div>

                {/* Status Message Banner */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-start gap-3 text-xs">
                  <Info size={16} className="text-[#0B57D0] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-zinc-900">Current Status Update</div>
                    <p className="text-zinc-600 leading-relaxed">
                      {isVerified
                        ? `Payment confirmed! Our Singapore warehouse at 9 Eunos Ave 8A is packing your carton items for ${isPickup ? "self-pickup collection" : "doorstep delivery dispatch"}.`
                        : "We are verifying your PayNow transfer reference. As soon as verification is confirmed, your status will update automatically."}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. SUMMARY PAYMENT ORDER LOOK LIKE A CLEAN DIGITAL RECEIPT */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6 print:border-none print:shadow-none print:p-0">
                
                {/* Receipt Top Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                  <div className="space-y-1">
                    <div className="font-black text-lg sm:text-xl text-zinc-950 tracking-tight flex items-center gap-2">
                      <span>HSG GLOBAL PTE. LTD.</span>
                      <span className="text-[10px] bg-slate-100 text-zinc-600 px-2 py-0.5 rounded-full font-mono font-bold">
                        OFFICIAL RECEIPT
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 space-y-0.5">
                      <p>UEN: <strong>202301234K</strong> • Registered in Singapore</p>
                      <p>Warehouse: 9 Eunos Ave 8A, Eunos Industrial Estate, Singapore 409461</p>
                      <p>Support: sales@hsgglobal.sg</p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right space-y-1 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Receipt Number</span>
                    <span className="text-xl font-black font-mono text-zinc-950 block">
                      {trackedOrder.order_ref}
                    </span>
                    <span className="text-xs text-zinc-500 block">
                      {trackedOrder.created_at ? new Date(trackedOrder.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      }) : ""}
                    </span>
                  </div>
                </div>

                {/* Receipt Information Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 rounded-2xl p-4.5 border border-slate-200/80">
                  {/* Customer Details */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                      Customer Information
                    </span>
                    <div className="font-bold text-zinc-900 text-sm">{maskCustomerName(trackedOrder.customer_name)}</div>
                    <div className="text-zinc-600">{maskCustomerPhone(trackedOrder.customer_phone)}</div>
                    {trackedOrder.customer_email && <div className="text-zinc-500">{trackedOrder.customer_email}</div>}
                  </div>

                  {/* Delivery / Fulfillment Details */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                      Fulfillment Method
                    </span>
                    <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                      {isPickup ? <Building2 size={13} className="text-[#0B57D0]" /> : <Truck size={13} className="text-[#0B57D0]" />}
                      <span>{isPickup ? "Warehouse Self-Pickup" : "Doorstep Delivery"}</span>
                    </div>
                    {isPickup ? (() => {
                      const warehouseContact = settings.store_person_contact || (() => {
                        const match = (trackedOrder.delivery_notes || "").match(/Store Person:\s*(\+?[\d\s]+)/i);
                        return match ? match[1].trim() : "+65 8123 4567";
                      })();
                      const cleanTel = warehouseContact.replace(/\s+/g, "");

                      return (
                        <div className="text-zinc-600 space-y-1.5 pt-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-900 text-xs">
                              {settings.store_person_name || "Warehouse Store Person"}
                            </span>
                            <a
                              href={`tel:${cleanTel}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-[#0B57D0] hover:text-[#0842A0] font-bold border border-blue-200/80 transition-all active:scale-95 text-xs shadow-2xs cursor-pointer"
                              title="Call Warehouse Person"
                            >
                              <Phone size={11} className="text-[#0B57D0]" />
                              <span>{warehouseContact}</span>
                            </a>
                          </div>
                          <div className="text-zinc-700 leading-snug text-xs">
                            {settings.warehouse_address || "9 Eunos Ave 8A, EUNOS INDUSTRIAL ESTATE, Singapore 409461"}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-medium">
                            Collection Hours: {settings.pickup_hours || "Mon - Fri: 10:00 AM - 6:00 PM"}
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="text-zinc-600">
                        {`${trackedOrder.delivery_address || ""} ${trackedOrder.unit_no || ""} (S${trackedOrder.postal_code || ""})`}
                      </div>
                    )}
                    {cleanCustomerNote(trackedOrder.delivery_notes) && (
                      <div className="text-[11px] text-zinc-500 italic pt-1">
                        Note: "{cleanCustomerNote(trackedOrder.delivery_notes)}"
                      </div>
                    )}
                  </div>

                  {/* Payment Method & Status */}
                  <div className="space-y-1 sm:col-span-2 pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                        Payment Method
                      </span>
                      <span className="font-bold text-zinc-800">Singapore PayNow SGQR</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 text-xs">Payment Status:</span>
                      <span
                        className={`font-bold px-2.5 py-0.5 rounded-full text-xs ${
                          isVerified
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {isVerified ? "Verified / Paid" : "Pending Verification"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. FULL LIST OF ITEMS ORDERED */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 gap-2">
                    <h3 className="font-bold text-xs uppercase tracking-wide text-zinc-900 whitespace-nowrap">
                      Ordered Cartons ({trackedOrder.total_cartons} CTN)
                    </h3>
                    <span className="text-[11px] text-zinc-400 whitespace-nowrap hidden sm:inline">
                      Itemized Specifications
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {trackedOrder.items?.map((item: any, idx: number) => {
                      const isMix = item.carton_type === "custom_mix" || (item.loose_bottles && item.loose_bottles.length > 0);
                      const lineTotal = Number(item.carton_price || 0) * Number(item.carton_qty || 1);
                      const itemProd = item.sku ? productMap.get(item.sku) : null;
                      const hasItemBcrs = Boolean(item.has_bcrs || itemProd?.has_bcrs || (item.loose_bottles && item.loose_bottles.some((lb: any) => lb.has_bcrs || productMap.get(lb.sku)?.has_bcrs)));

                      return (
                        <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="font-medium text-zinc-900 text-xs truncate" title={item.name}>
                              {item.name}
                            </div>

                            {/* Packaging Specifications & BCRS Badge */}
                            <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-1.5">
                              <span>
                                {item.carton_qty} ctn × ${Number(item.carton_price).toFixed(2)}
                              </span>
                              {item.sku && (
                                <>
                                  <span className="text-zinc-300">•</span>
                                  <span className="font-mono text-zinc-400 text-[10px]">
                                    SKU: {item.sku}
                                  </span>
                                </>
                              )}
                              {hasItemBcrs && (
                                <>
                                  <span className="text-zinc-300">•</span>
                                  <span className="bg-slate-100 text-zinc-600 border border-slate-200 px-1 py-0.2 rounded text-[9px] font-medium">
                                    BCRS Applied
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Custom Mix Loose Bottle Breakdown */}
                            {isMix && item.loose_bottles && item.loose_bottles.length > 0 && (
                              <div className="mt-1.5 bg-slate-50 border border-slate-200/70 rounded-xl p-2 space-y-1">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                                  Intra-Brand Mix Selections:
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                                  {item.loose_bottles.map((b: any, bIdx: number) => (
                                    <div key={bIdx} className="flex items-center justify-between pr-2 text-zinc-700">
                                      <span className="truncate">• {b.flavor || b.name || b.sku}</span>
                                      <span className="font-medium text-zinc-900 shrink-0 ml-1">{b.qty} pcs</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Qty & Price */}
                          <div className="text-right shrink-0 pt-0.5">
                            <div className="font-semibold text-xs text-zinc-900">
                              SGD ${lineTotal.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* FINANCIAL SUMMARY / RECEIPT TOTALS */}
                <div className="border-t-2 border-dashed border-slate-200 pt-4 space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-600">
                    <span>Cartons Subtotal:</span>
                    <span className="font-medium font-mono text-zinc-900">
                      SGD ${orderSubtotal.toFixed(2)}
                    </span>
                  </div>

                  {bcrsAmount > 0 && (
                    <div className="flex justify-between items-center text-zinc-600">
                      <span>BCRS Applied:</span>
                      <span className="font-medium font-mono text-zinc-900">
                        +SGD ${bcrsAmount.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery Fee ({isPickup ? "Self-Pickup" : "Singapore Mainland"}):</span>
                    <span className="font-medium font-mono text-zinc-900">
                      {Number(trackedOrder.delivery_fee || 0) === 0 ? "SGD $0.00 (Free)" : `SGD $${Number(trackedOrder.delivery_fee).toFixed(2)}`}
                    </span>
                  </div>

                  {Number(trackedOrder.discount_amount || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Discount Applied:</span>
                      <span className="font-mono">-SGD ${Number(trackedOrder.discount_amount).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-3 border-t border-slate-200 text-sm">
                    <span className="font-extrabold text-zinc-950 uppercase tracking-wider">Total Payable:</span>
                    <span className="text-2xl font-black font-mono text-zinc-950">
                      SGD ${Number(trackedOrder.total_amount).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Receipt Footer Decorative / Print Notice */}
                <div className="pt-4 border-t border-slate-100 text-center text-[11px] text-zinc-400">
                  Thank you for purchasing with HSG Global Pte. Ltd. This receipt is computer-generated.
                </div>

                {/* Policy Links */}
                <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 pt-6 pb-8 print:hidden">
                  <button
                    type="button"
                    onClick={() => setPolicyModal("terms")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Delivery Policy
                  </button>
                  <span className="text-zinc-300">•</span>
                  <button
                    type="button"
                    onClick={() => setPolicyModal("refund")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Refund Terms
                  </button>
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
          {Boolean(settings.show_hero_section) && (
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

          <main className={`flex-1 max-w-6xl w-full mx-auto px-4 py-5 sm:py-6 ${totalCartons > 0 ? "pb-24 sm:pb-28" : ""}`}>
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
                <div className="bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 rounded-2xl p-5 sm:p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
                    <Package size={14} className="text-[#0B57D0]" />
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
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col animate-pulse"
                  >
                    <div className="aspect-square bg-slate-100" />
                    <div className="p-3.5 flex flex-col flex-1 justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="h-3.5 bg-slate-100 rounded w-4/5" />
                        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div className="h-4 bg-slate-100 rounded w-16" />
                        <div className="h-7 w-14 bg-slate-100 rounded-lg" />
                      </div>
                    </div>
                  </div>
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
                      className="group bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col"
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
                          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-108 transform-gpu"
                          loading="lazy"
                          decoding="async"
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
      {totalCartons > 0 && !trackedOrder && !thankYouOrder && !isThankYouRoute && !isTrackingRoute && !cartDrawerOpen && !checkoutModalOpen && !paymentModalOpen && (
        <div 
          ref={floatingBarRef}
          className="fixed inset-x-4 max-w-md mx-auto z-40 animate-in slide-in-from-bottom duration-200 pointer-events-none"
          style={{ bottom: `${footerOverlap}px` }}
        >
          <div className="bg-white/95 backdrop-blur-md text-zinc-900 px-3.5 py-2.5 rounded-full shadow-lg border border-slate-200 flex items-center justify-between gap-3 pointer-events-auto">
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
                    <div className="flex justify-between items-center text-zinc-600">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>Discount ({discountInfo.ruleName}):</span>
                        {appliedPromoCode && (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedPromoCode("");
                              setPromoCodeInput("");
                              setShowPromoInput(true);
                            }}
                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-red-500 hover:text-red-700 underline cursor-pointer transition-colors"
                            title="Clear promo code"
                          >
                            <X size={11} className="shrink-0 text-red-500" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>
                      <span className="font-semibold text-zinc-900">-${discountInfo.discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery Fee:</span>
                    <span className="font-semibold text-zinc-900">
                      {deliveryFee === 0 ? "FREE" : `$${deliveryFee.toFixed(2)}`}
                    </span>
                  </div>

                  {totalBcrs > 0 && (
                    <div className="flex justify-between items-center text-zinc-600">
                      <span>BCRS Applied:</span>
                      <span className="font-semibold text-zinc-900">+${totalBcrs.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-extrabold text-zinc-950 pt-2 border-t border-slate-200">
                    <span>Total Payable:</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>

                  {/* Promo Code Input: Hidden when a valid promo is applied; shows when cleared or requested */}
                  {appliedPromoCode && !discountInfo.promoError ? null : (
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
                            <button
                              type="button"
                              onClick={() => {
                                setShowPromoInput(false);
                                setPromoCodeInput("");
                                setAppliedPromoCode("");
                              }}
                              className="text-[10px] text-zinc-400 hover:text-zinc-600 underline cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                placeholder="EG : HSGGLOBAL"
                                value={promoCodeInput}
                                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && promoCodeInput.trim()) {
                                    setAppliedPromoCode(promoCodeInput.trim());
                                  }
                                }}
                                className="w-full pl-3.5 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-[#0B57D0]"
                                autoFocus
                              />
                              {promoCodeInput && (
                                <button
                                  type="button"
                                  onClick={() => setPromoCodeInput("")}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
                                  title="Clear input text"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
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
                          {appliedPromoCode && discountInfo.promoError && (
                            <div className="mt-2 space-y-1">
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
                                  }}
                                  className="text-[10px] text-zinc-500 hover:text-zinc-800 underline shrink-0 cursor-pointer"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Minimum Cartons Checker / Proceed Button */}
                  <div className="pt-2">
                    {isOrderExceedingLimit ? (
                      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs space-y-2.5 shadow-2xs">
                        <div className="flex items-start gap-2 text-amber-900 font-bold">
                          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                          <span>Bulk Order Limit Reached (${maxOrderLimit.toLocaleString()})</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed text-[11px]">
                          Orders exceeding <strong>${maxOrderLimit.toLocaleString()}</strong> qualify for special volume pricing and bulk distributor discounts! Please contact our sales team on WhatsApp to receive a special price quotation.
                        </p>
                        <a
                          href={`https://wa.me/${(settings.whatsapp_number || "+65 80892248").replace(/\D/g, "")}?text=${encodeURIComponent(
                            `Hi HSG Global, I have an order of ${totalCartons} cartons ($${totalAmount.toFixed(2)}) and would like to request special bulk pricing.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full h-11 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer shadow-xs"
                        >
                          <MessageSquare size={15} />
                          <span>Contact Sales for Special Price</span>
                        </a>
                      </div>
                    ) : !canCheckout ? (
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

                {/* Policy Links */}
                <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 pt-1 pb-4">
                  <button
                    type="button"
                    onClick={() => setPolicyModal("terms")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Delivery Policy
                  </button>
                  <span className="text-zinc-300">•</span>
                  <button
                    type="button"
                    onClick={() => setPolicyModal("refund")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Refund Terms
                  </button>
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
            <div className="bg-[#F8F9FA] border-b border-slate-200 px-5 py-3.5 shrink-0">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-900 mb-1.5">
                <span className="text-zinc-700">Carton Progress</span>
                <span
                  className={
                    currentMixTotalBottles === activeTargetCartonSize
                      ? "text-emerald-600 font-bold"
                      : "text-zinc-600 font-medium"
                  }
                >
                  <strong className={currentMixTotalBottles === activeTargetCartonSize ? "text-emerald-600" : "text-[#0B57D0]"}>
                    {currentMixTotalBottles}
                  </strong>{" "}
                  / {activeTargetCartonSize} Items Selected
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    currentMixTotalBottles === activeTargetCartonSize ? "bg-emerald-500" : "bg-[#0B57D0]"
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
                                  loading="lazy"
                                  decoding="async"
                                />
                                <div>
                                  <div className="font-bold text-xs text-zinc-900">{product.display_name}</div>
                                  <div className="text-[11px] text-zinc-500 font-medium">
                                    ${product.price_per_piece.toFixed(2)} / pc
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
                      <span className="text-[11px] text-zinc-500">FREE ($0.00) • Eunos</span>
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

                    <div className="flex items-center gap-2 pt-2 border-t border-blue-200/60 text-xs">
                      <Clock size={14} className="text-[#0B57D0] shrink-0" />
                      <div className="text-zinc-700">
                        <span className="font-semibold text-zinc-500">Collection Timing: </span>
                        <span className="font-bold text-zinc-900">{settings.pickup_hours || "Mon - Fri: 10:00 AM - 6:00 PM"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-blue-200/60 text-xs">
                      <Phone size={14} className="text-[#0B57D0] shrink-0" />
                      <div className="text-zinc-700">
                        <span className="font-semibold text-zinc-500">Warehouse Contact: </span>
                        <a
                          href={`tel:${(settings.store_person_contact || "+65 8123 4567").replace(/\s+/g, "")}`}
                          className="font-bold text-[#0B57D0] hover:underline"
                        >
                          {settings.store_person_name || "Warehouse Store Person"} ({settings.store_person_contact || "+65 8123 4567"})
                        </a>
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
                    <div className="flex justify-between items-center text-zinc-600">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>Discount ({discountInfo.ruleName}):</span>
                        {appliedPromoCode && (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedPromoCode("");
                              setPromoCodeInput("");
                              setShowPromoInput(true);
                            }}
                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-red-500 hover:text-red-700 underline cursor-pointer transition-colors"
                            title="Clear promo code"
                          >
                            <X size={11} className="shrink-0 text-red-500" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>
                      <span className="font-semibold text-zinc-900">-${discountInfo.discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery:</span>
                    <span className="font-semibold text-zinc-900">
                      {deliveryMethod === "pickup" ? "FREE ($0.00 - Self Pickup)" : (deliveryFee === 0 ? "FREE" : `$${deliveryFee.toFixed(2)}`)}
                    </span>
                  </div>

                  {totalBcrs > 0 && (
                    <div className="flex justify-between items-center text-zinc-600">
                      <span>BCRS Applied:</span>
                      <span className="font-semibold text-zinc-900">+${totalBcrs.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-extrabold text-zinc-950 pt-2 border-t border-slate-200">
                    <span>Total to Pay via SGQR:</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>

                  {isOrderExceedingLimit ? (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs space-y-2.5 shadow-2xs">
                        <div className="flex items-start gap-2 text-amber-900 font-bold">
                          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                          <span>Bulk Order Limit Reached (${maxOrderLimit.toLocaleString()})</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed text-[11px]">
                          Orders exceeding <strong>${maxOrderLimit.toLocaleString()}</strong> qualify for special volume pricing and custom distributor discounts. Please contact our corporate sales team on WhatsApp to place your order with special pricing.
                        </p>
                        <a
                          href={`https://wa.me/${(settings.whatsapp_number || "+65 80892248").replace(/\D/g, "")}?text=${encodeURIComponent(
                            `Hi HSG Global, I have an order of ${totalCartons} cartons ($${totalAmount.toFixed(2)}) and would like to request special bulk pricing.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full h-11 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer shadow-xs"
                        >
                          <MessageSquare size={15} />
                          <span>Contact Sales for Special Price</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3 text-[11px] text-zinc-600 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-[#0B57D0] shrink-0 mt-0.5" />
                  <span>Instant PayNow SGQR will be generated for direct bank transfer without logging in.</span>
                </div>

                {/* Policy Links */}
                <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 pt-1 pb-4">
                  <button
                    type="button"
                    onClick={() => setPolicyModal("terms")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Delivery Policy
                  </button>
                  <span className="text-zinc-300">•</span>
                  <button
                    type="button"
                    onClick={() => setPolicyModal("refund")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Refund Terms
                  </button>
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
                      Expires in {String(Math.floor(timeLeftSeconds / 60)).padStart(2, "0")}:{String(timeLeftSeconds % 60).padStart(2, "0")}
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

                {/* Real-time Bank Email Status / Indicator (only shown if auto-verified by bank) */}
                {autoVerified && (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3 text-xs text-emerald-800 font-bold flex items-center justify-center gap-2 shadow-xs animate-pulse">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>Payment Verified by Bank! Redirecting to confirmation...</span>
                  </div>
                )}

                {/* Action Button: I have already paid only */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleAlreadyPaid}
                    className={`w-full h-12 text-white font-extrabold text-sm rounded-full flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer shadow-md ${
                      autoVerified
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-[#25D366] hover:bg-[#20bd5a]"
                    }`}
                  >
                    <CheckCircle2 size={18} />
                    <span>{autoVerified ? "Payment Verified! Redirecting..." : "I have already paid"}</span>
                  </button>
                </div>

                <p className="text-[10px] text-zinc-400 text-center leading-relaxed">
                  Click "I have already paid" after completing your PayNow transfer to view your order confirmation and details.
                </p>

                {/* Policy Links */}
                <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 pt-2 pb-6">
                  <button
                    type="button"
                    onClick={() => setPolicyModal("terms")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Delivery Policy
                  </button>
                  <span className="text-zinc-300">•</span>
                  <button
                    type="button"
                    onClick={() => setPolicyModal("refund")}
                    className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer transition-colors"
                  >
                    Refund Terms
                  </button>
                </div>
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
      {/* MODAL POPUP: PAYMENT SESSION EXPIRED                      */}
      {/* ========================================================= */}
      {expirePopupOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 select-none">
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Clock size={24} />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-zinc-950">Payment Session Expired</h3>
              <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                The 5-minute payment window has expired and this order was canceled.
              </p>
              <p className="text-[11px] text-zinc-400 mt-1.5">
                Click OK to review your details and generate a fresh QR code.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setExpirePopupOpen(false);
                  setPaymentModalOpen(false);
                  clearPaymentSession();
                  setCheckoutModalOpen(true);
                }}
                className="w-full h-10 bg-zinc-800 hover:bg-zinc-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-98"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STOREFRONT FOOTER                                         */}
      {/* ========================================================= */}
      {!trackedOrder && !thankYouOrder && !isThankYouRoute && !isTrackingRoute && (
        <footer ref={footerRef} className="bg-white border-t border-slate-200 py-10 mt-auto">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-zinc-500 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-3.5">
              <img
                src="/HSG Global Logo Official.jpeg"
                alt={settings.company_name || "HSG Global"}
                className="w-14 h-14 aspect-square rounded-2xl object-cover border border-slate-200/80 shadow-2xs shrink-0"
              />
              <div>
                <div className="font-extrabold text-sm text-zinc-900">{settings.company_name}</div>
                <div className="mt-1">UEN: {settings.company_uen} • Official Singapore Distribution</div>
                <div className="mt-0.5">Support WhatsApp: +65 8475 5948 • {settings.support_email}</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto justify-center">
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                <button
                  onClick={() => navigateTo("/policy")}
                  className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer font-medium"
                >
                  Privacy Policy
                </button>
                <button
                  onClick={() => navigateTo("/tnc")}
                  className="hover:text-zinc-900 underline underline-offset-2 cursor-pointer font-medium"
                >
                  Terms & Conditions
                </button>
              </div>

              <span className="text-zinc-300 hidden sm:inline">|</span>

              {/* Order History Footer Button - Bottom Center on Mobile */}
              <div className="flex justify-center w-full sm:w-auto">
                {!authCustomerPhone ? (
                  <button
                    onClick={handleOpenLogin}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200/80 text-zinc-800 hover:text-zinc-950 border border-slate-200 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                  >
                    <Package size={14} className="text-zinc-600" />
                    Order History
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5">
                    <button
                      onClick={() => {
                        setOrderHistoryModalOpen(true);
                        fetchPastOrders(authCustomerPhone);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-800 hover:text-zinc-950 cursor-pointer"
                    >
                      <Package size={13} className="text-zinc-600" />
                      Orders ({authCustomerPhone.startsWith("65") ? `+65 ${authCustomerPhone.slice(2)}` : authCustomerPhone})
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={handleLogout}
                      className="text-[11px] text-zinc-500 hover:text-zinc-800 underline cursor-pointer"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* ========================================================= */}
      {/* WHATSAPP PASSWORDLESS LOGIN MODAL                          */}
      {/* ========================================================= */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <MessageSquare size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-950">Login with WhatsApp</h3>
                  <p className="text-[11px] text-zinc-500">Access your past orders & receipts</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setLoginModalOpen(false);
                  setLoginSession(null);
                }}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5">
              {loginLoading || !loginSession ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <RefreshCw size={24} className="animate-spin text-emerald-600 mb-3" />
                  <p className="text-xs font-semibold text-zinc-700">Connecting to WhatsApp service...</p>
                </div>
              ) : (() => {
                const targetPhone = loginSession.target_whatsapp_phone || "6584755948";
                const waText = encodeURIComponent(loginSession.prefilled_message || `Login: ${loginSession.auth_code}`);
                const waMobileUrl = `https://wa.me/${targetPhone}?text=${waText}`;
                const waWebUrl = `https://web.whatsapp.com/send?phone=${targetPhone}&text=${waText}`;

                return (
                  <div className="space-y-3.5">
                    {/* Desktop: QR Code */}
                    <div className="hidden sm:flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl text-center space-y-2.5 shadow-2xs">
                      <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-xs">
                        <QRCodeCanvas value={waMobileUrl} size={150} level="M" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-zinc-700">
                          Scan with your phone camera to log in
                        </p>
                        <a
                          href={waWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                        >
                          <ExternalLink size={12} />
                          Or open WhatsApp Web
                        </a>
                      </div>
                    </div>

                    {/* Mobile: Direct WhatsApp Button */}
                    <div className="block sm:hidden">
                      <a
                        href={waMobileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
                      >
                        <MessageSquare size={16} className="fill-white/20" />
                        Open WhatsApp & Send Code
                      </a>
                    </div>

                    {/* Auth Code Bar (Compact single line) */}
                    <div className="bg-[#F8F9FA] border border-slate-200 rounded-xl px-3.5 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-zinc-500">Code:</span>
                        <span className="text-sm font-black font-mono tracking-wider text-zinc-950">
                          {loginSession.auth_code}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(loginSession.auth_code);
                          setAuthCopied(true);
                          setTimeout(() => setAuthCopied(false), 2000);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-zinc-700 flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 transition-all"
                      >
                        {authCopied ? (
                          <>
                            <Check size={12} className="text-emerald-600" />
                            <span className="text-emerald-600 text-[11px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span className="text-[11px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Polling Live Radar */}
                    <div className="flex items-center justify-center gap-2 pt-0.5 text-xs text-zinc-500">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-[11px]">Waiting for message...</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VERIFY ORDER OWNER (4-DIGIT PHONE) MODAL                  */}
      {/* ========================================================= */}
      {verifyOwnerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#0B57D0] flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-950">Verify Phone Number</h3>
                  <p className="text-[11px] text-zinc-500">Enter last 4 digits of phone number</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVerifyOwnerModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="text-center space-y-2">
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Please complete the phone number below:
                </p>
                <div className="inline-block px-3.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono font-extrabold text-sm text-zinc-900 tracking-wider">
                  {maskCustomerPhone(trackedOrder?.customer_phone)}
                </div>
              </div>

              {/* 4 Digit Boxes [ ] [ ] [ ] [ ] */}
              <div className="flex items-center justify-center gap-3 py-1">
                {[0, 1, 2, 3].map((idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      verifyInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    disabled={verifyLockoutRemainingSec > 0}
                    value={verifyDigits[idx] || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(-1);
                      const next = [...verifyDigits];
                      next[idx] = val;
                      setVerifyDigits(next);
                      if (verifyError && verifyLockoutRemainingSec <= 0) setVerifyError("");
                      if (val && idx < 3) {
                        verifyInputRefs.current[idx + 1]?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !verifyDigits[idx] && idx > 0) {
                        const next = [...verifyDigits];
                        next[idx - 1] = "";
                        setVerifyDigits(next);
                        verifyInputRefs.current[idx - 1]?.focus();
                      } else if (e.key === "Enter") {
                        handleVerifyOwnerSubmit();
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      if (verifyLockoutRemainingSec > 0) return;
                      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
                      if (!pasted) return;
                      const next = ["", "", "", ""];
                      for (let i = 0; i < 4; i++) {
                        next[i] = pasted[i] || "";
                      }
                      setVerifyDigits(next);
                      const focusIdx = Math.min(3, pasted.length);
                      verifyInputRefs.current[focusIdx]?.focus();
                    }}
                    className={`w-12 h-13 text-center text-xl font-black font-mono rounded-xl border transition-all outline-none ${
                      verifyLockoutRemainingSec > 0
                        ? "bg-slate-100 border-slate-200 text-zinc-400 cursor-not-allowed"
                        : "bg-white border-slate-300 text-zinc-950 focus:border-[#0B57D0] focus:ring-3 focus:ring-[#0B57D0]/15"
                    }`}
                  />
                ))}
              </div>

              {/* Error / 5-Minute Cooldown Notice */}
              {verifyLockoutRemainingSec > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center space-y-1">
                  <div className="text-xs font-bold text-red-700 flex items-center justify-center gap-1.5">
                    <Clock size={13} />
                    <span>Phone Number Incorrect</span>
                  </div>
                  <p className="text-[11px] text-red-600">
                    Please wait{" "}
                    <span className="font-mono font-extrabold">
                      {String(Math.floor(verifyLockoutRemainingSec / 60)).padStart(2, "0")}:
                      {String(verifyLockoutRemainingSec % 60).padStart(2, "0")}
                    </span>{" "}
                    to try again.
                  </p>
                </div>
              ) : verifyError ? (
                <div className="text-xs font-semibold text-red-600 text-center">
                  {verifyError}
                </div>
              ) : null}

              {/* Verify Action Button */}
              <button
                type="button"
                disabled={verifyLockoutRemainingSec > 0 || verifyDigits.join("").length < 4}
                onClick={() => handleVerifyOwnerSubmit()}
                className={`w-full h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  verifyLockoutRemainingSec > 0 || verifyDigits.join("").length < 4
                    ? "bg-slate-100 text-zinc-400 cursor-not-allowed"
                    : "bg-[#0B57D0] hover:bg-[#0842A0] text-white cursor-pointer shadow-xs active:scale-98"
                }`}
              >
                <span>Verify & View My Orders</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ORDER HISTORY MODAL                                       */}
      {/* ========================================================= */}
      {orderHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#D3E3FD] text-[#041E49] flex items-center justify-center shrink-0">
                  <Package size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-950">My Order History</h3>
                  <p className="text-[11px] text-zinc-500">
                    Orders linked to <span className="font-mono font-bold text-zinc-700">{authCustomerPhone}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchPastOrders(authCustomerPhone)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                  title="Refresh orders"
                >
                  <RefreshCw size={14} className={pastOrdersLoading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setOrderHistoryModalOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Orders Content Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {pastOrdersLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <RefreshCw size={24} className="animate-spin text-[#0B57D0] mb-3" />
                  <p className="text-xs font-semibold text-zinc-600">Retrieving your orders...</p>
                </div>
              ) : pastOrders.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-zinc-400 flex items-center justify-center mb-3">
                    <Package size={22} />
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900">No Past Orders Found</h4>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    We couldn't find any orders matching phone <span className="font-mono font-bold text-zinc-700">{authCustomerPhone}</span>.
                    Any orders placed with this phone number will appear here automatically.
                  </p>
                </div>
              ) : (
                pastOrders.map((ord: any) => {
                  const isVerified = ord.payment_status === "verified";
                  const isPickup = (ord.delivery_address || "").toLowerCase().includes("self-pickup");
                  const dateStr = ord.created_at
                    ? new Date(Number(ord.created_at)).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "";

                  return (
                    <div
                      key={ord.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors shadow-2xs space-y-3"
                    >
                      {/* Top Row: Ref, Date, Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-xs text-zinc-950">
                            {ord.order_ref}
                          </span>
                          <span className="text-[11px] text-zinc-400">•</span>
                          <span className="text-[11px] text-zinc-500">{dateStr}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Payment status badge */}
                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={11} />
                              Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock size={11} />
                              Awaiting PayNow
                            </span>
                          )}

                          {/* Fulfillment status badge */}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-zinc-700 border border-slate-200">
                            {ord.fulfillment_status === "completed"
                              ? (isPickup ? "Collected" : "Delivered")
                              : ord.fulfillment_status === "out_for_delivery"
                              ? "Out for Delivery"
                              : ord.fulfillment_status === "packing"
                              ? "Packing Cartons"
                              : isPickup
                              ? "Ready for Self-Pickup"
                              : "Order Received"}
                          </span>
                        </div>
                      </div>

                      {/* Middle Row: Items & Delivery Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                            Cartons ({ord.total_cartons} CTN)
                          </div>
                          <div className="space-y-0.5 max-h-20 overflow-y-auto pr-1">
                            {ord.items && ord.items.length > 0 ? (
                              ord.items.map((it: any, iIdx: number) => (
                                <div key={iIdx} className="text-zinc-700 text-[11px] truncate">
                                  {it.carton_qty}x {it.name}
                                </div>
                              ))
                            ) : (
                              <div className="text-zinc-500 text-[11px]">{ord.total_cartons} cartons</div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                            {isPickup ? "Self-Pickup" : "Delivery Address"}
                          </div>
                          <div className="text-zinc-700 text-[11px] line-clamp-2">
                            {isPickup
                              ? "Warehouse: 9 Eunos Ave 8A, Singapore 409461"
                              : `${ord.delivery_address || ""} ${ord.unit_no || ""} (S${ord.postal_code || ""})`}
                          </div>
                          <div className="text-base font-black text-zinc-950 mt-1">
                            SGD ${Number(ord.total_amount).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row Action */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400">
                          {isPickup ? "Self-Pickup order" : "Doorstep Delivery"}
                        </span>
                        <button
                          onClick={() => {
                            setOrderHistoryModalOpen(false);
                            navigateTo(`/track?ref=${ord.order_ref}`);
                            loadTrackedOrder(ord.order_ref);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B57D0] hover:bg-[#0842A0] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          View Order & Receipt
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Policy Modal */}
      {policyModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl">
            <h3 className="font-bold text-sm text-zinc-900 mb-2">
              {policyModal === "terms" ? "Delivery Terms Policy" : "Refund & Damaged Goods Policy"}
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              {policyModal === "terms" ? settings.delivery_terms : settings.refund_policy}
            </p>
            <button
              onClick={() => setPolicyModal(null)}
              className="mt-4 w-full h-9 bg-zinc-900 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
