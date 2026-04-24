package com.vipe.abastecimento;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class DateUtils {
    private static final SimpleDateFormat DATE = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    private static final SimpleDateFormat DATE_TIME = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US);
    private static final SimpleDateFormat ISO = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);

    public static String today() {
        return DATE.format(new Date());
    }

    public static String nowForInput() {
        return DATE_TIME.format(new Date());
    }

    public static String nowIso() {
        return ISO.format(new Date());
    }
}
