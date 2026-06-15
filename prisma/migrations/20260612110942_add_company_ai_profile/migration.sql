-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCustomerTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedCustomerTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valueProposition" TEXT NOT NULL,
    "salesTone" TEXT NOT NULL,
    "minimumOrderNote" TEXT,
    "outreachLanguage" TEXT NOT NULL DEFAULT 'tr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);
