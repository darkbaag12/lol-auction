package com.gyeongmae.auction;

import org.apache.poi.ss.usermodel.*;
import org.junit.jupiter.api.Test;
import java.io.FileInputStream;

public class ExcelParserTest {
    @Test
    public void testExcel() throws Exception {
        try (FileInputStream fis = new FileInputStream("c:/gyeongmae program/2026-1학기 리그 오브 레전드 멸망전(응답).xlsx");
             Workbook workbook = WorkbookFactory.create(fis);
             java.io.FileWriter fw = new java.io.FileWriter("c:/gyeongmae program/backend/test_output.txt")) {
            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            if (headerRow != null) {
                int i = 0;
                for (Cell cell : headerRow) {
                    fw.write("HEADER " + (i++) + ": " + cell.getStringCellValue() + "\n");
                }
            }
            Row dataRow = sheet.getRow(1);
            if (dataRow != null) {
                int i = 0;
                for (Cell cell : dataRow) {
                    fw.write("DATA " + (i++) + ": " + cell.toString() + "\n");
                }
            }
        }
    }
}
