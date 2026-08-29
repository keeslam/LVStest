import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { UserRole, UserPermission } from "@shared/schema";

type NavItem = {
  href: string;
  labelKey: string;
  icon: string;
  permissions?: string[];
};

export function SidebarNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation("nav");
  const isAdmin = user?.role === UserRole.ADMIN;

  const navItems: NavItem[] = [
    { href: "/", labelKey: "dashboard", icon: "dashboard", permissions: [UserPermission.VIEW_DASHBOARD] },
    { href: "/vehicles", labelKey: "vehicles", icon: "directions_car", permissions: [UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES] },
    { href: "/scan", labelKey: "scan", icon: "scan", permissions: [UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES] },
    { href: "/customers", labelKey: "customers", icon: "people", permissions: [UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS] },
    { href: "/reservations", labelKey: "reservations", icon: "event", permissions: [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS] },
    { href: "/maintenance", labelKey: "maintenance", icon: "maintenance", permissions: [UserPermission.MANAGE_MAINTENANCE] },
    { href: "/expenses", labelKey: "expenses", icon: "euro", permissions: [UserPermission.MANAGE_EXPENSES] },
    { href: "/documents", labelKey: "documents", icon: "description", permissions: [UserPermission.MANAGE_DOCUMENTS] },
    { href: "/delivery", labelKey: "transports", icon: "delivery", permissions: [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS] },
    { href: "/communications", labelKey: "communications", icon: "email", permissions: [UserPermission.MANAGE_EMAIL_TEMPLATES, UserPermission.MANAGE_NOTIFICATIONS] },
    { href: "/reports", labelKey: "reports", icon: "assessment", permissions: [UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS] }
  ];

  const hasPermission = (item: NavItem): boolean => {
    if (!item.permissions || item.permissions.length === 0) return true;
    if (isAdmin) return true;
    const userPermissions = (user?.permissions as string[]) || [];
    return item.permissions.some(perm => userPermissions.includes(perm));
  };

  const filteredNavItems = navItems.filter(hasPermission);

  return (
    <nav className="mt-4 px-2">
      <div className="space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = item.href === "/"
            ? location === item.href
            : location.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-2 py-2 text-base font-medium rounded-md ${
                isActive
                  ? "bg-primary-50 text-primary-600"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="mr-3 text-xl">
                {getNavIcon(item.icon, isActive)}
              </span>
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function getNavIcon(iconName: string, isActive: boolean) {
  const className = isActive ? "text-primary-500" : "text-gray-500";
  
  switch (iconName) {
    case "dashboard":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-layout-dashboard ${className}`}>
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      );
    case "directions_car":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-car ${className}`}>
          <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
          <circle cx="6.5" cy="16.5" r="2.5" />
          <circle cx="16.5" cy="16.5" r="2.5" />
        </svg>
      );
    case "people":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-users ${className}`}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "event":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-calendar ${className}`}>
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      );
    case "euro":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-euro ${className}`}>
          <path d="M4 10h12" />
          <path d="M4 14h9" />
          <path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" />
        </svg>
      );
    case "description":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-file-text ${className}`}>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      );
    case "maintenance":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-settings ${className}`}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "assessment":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-bar-chart-3 ${className}`}>
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      );
    case "email":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-mail ${className}`}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case "delivery":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-truck ${className}`}>
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
          <path d="M15 18H9" />
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
          <circle cx="17" cy="18" r="2" />
          <circle cx="7" cy="18" r="2" />
        </svg>
      );
    case "scan":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-scan-line ${className}`}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 12h10" />
        </svg>
      );
    case "extension":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-clock-arrow-up ${className}`}>
          <path d="M13.228 21.925A10 10 0 1 1 21.994 12.338" />
          <path d="M12 6v6l3.447 1.724" />
          <path d="m19 15 1-1v6" />
          <path d="m19 15 1 1" />
          <path d="M20 21h-2" />
        </svg>
      );
    case "users_management":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-users-cog ${className}`}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <circle cx="19" cy="11" r="2" />
          <path d="M19 8v1" />
          <path d="M19 13v1" />
          <path d="M21.6 9.5l-.87.5" />
          <path d="M17.27 12l-.87.5" />
          <path d="M21.6 12.5l-.87-.5" />
          <path d="M17.27 10l-.87-.5" />
        </svg>
      );
    case "user_profile":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-user-circle-2 ${className}`}>
          <path d="M18 20a6 6 0 0 0-12 0" />
          <circle cx="12" cy="10" r="4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-circle ${className}`}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}